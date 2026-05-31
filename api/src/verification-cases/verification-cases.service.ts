import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEvent,
  EntityStatus,
  EntityType,
  KycStatus,
  Prisma,
  VerificationCaseStatus,
  VerificationCaseType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { IamService } from '../iam/iam.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignCaseDto } from './dto/assign-case.dto';
import { CaseQueryDto } from './dto/case-query.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { RejectCaseDto } from './dto/reject-case.dto';
import { ReviewCaseDto } from './dto/review-case.dto';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { EvidenceStorageService } from './evidence-storage.service';

// Allowed case types by entity type
const CASE_TYPE_MAP: Record<EntityType, VerificationCaseType[]> = {
  [EntityType.PERSON]: [VerificationCaseType.KYC, VerificationCaseType.RE_VERIFICATION],
  [EntityType.ORGANISATION]: [VerificationCaseType.KYB, VerificationCaseType.RE_VERIFICATION],
};

const CASE_INCLUDE = {
  entity: { select: { id: true, name: true, entityType: true, status: true } },
  createdBy: { select: { id: true, username: true, displayName: true } },
  reviewedBy: { select: { id: true, username: true, displayName: true } },
  approvedBy: { select: { id: true, username: true, displayName: true } },
  rejectedBy: { select: { id: true, username: true, displayName: true } },
  _count: { select: { evidence: true } },
} as const;

@Injectable()
export class VerificationCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: EvidenceStorageService,
    private readonly iam: IamService,
  ) {}

  // ── DEV-ONLY 4-eyes exemption ────────────────────────────────────────────────
  // When FOUR_EYES_ADMIN_OVERRIDE=true, ADMIN-level operators (those holding the
  // iso:manage permission) may bypass the distinct-user separation-of-duties
  // checks so one person can drive a case end-to-end during development.
  // Safe-by-default: if the env var is unset/false (e.g. production), strict
  // 4-eyes is fully enforced. Every actual bypass is stamped fourEyesOverride:true
  // in the audit trail. REMOVE/disable before production.
  private async isFourEyesExempt(userId: string): Promise<boolean> {
    if (process.env.FOUR_EYES_ADMIN_OVERRIDE !== 'true') return false;
    return this.iam.hasPermission(userId, 'iso:manage');
  }

  // ── Case CRUD ──────────────────────────────────────────────────────────────

  async createCase(dto: CreateCaseDto, userId: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException(`Entity ${dto.entityId} not found`);

    const allowed = CASE_TYPE_MAP[entity.entityType];
    if (!allowed.includes(dto.caseType)) {
      throw new BadRequestException(
        `Case type ${dto.caseType} is not allowed for ${entity.entityType} entities. ` +
          `Allowed types: ${allowed.join(', ')}`,
      );
    }

    const vc = await this.prisma.verificationCase.create({
      data: {
        id: randomUUID(),
        entityId: dto.entityId,
        caseType: dto.caseType,
        status: VerificationCaseStatus.DRAFT,
        priority: dto.priority ?? 'NORMAL',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: userId,
      },
      include: CASE_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.CASE_CREATED,
        entityId: dto.entityId,
        userId,
        detail: { caseId: vc.id, caseType: dto.caseType },
      },
    });

    return vc;
  }

  async listCases(query: CaseQueryDto) {
    const where: Prisma.VerificationCaseWhereInput = {
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.caseType ? { caseType: query.caseType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.verificationCase.findMany({
        where,
        include: CASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.verificationCase.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async getCaseById(id: string) {
    const vc = await this.prisma.verificationCase.findUnique({
      where: { id },
      include: CASE_INCLUDE,
    });
    if (!vc) throw new NotFoundException(`Verification case ${id} not found`);
    return vc;
  }

  // ── Workflow transitions ───────────────────────────────────────────────────

  async submitCase(id: string, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.DRAFT]);
    this.requireCreator(vc, userId, 'Only the case creator can submit');

    const evidenceCount = await this.prisma.verificationEvidence.count({
      where: { caseId: id },
    });
    if (evidenceCount === 0) {
      throw new BadRequestException('At least one evidence document must be uploaded before submitting');
    }

    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: { status: VerificationCaseStatus.SUBMITTED, submittedAt: new Date() },
      include: CASE_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.CASE_SUBMITTED,
        entityId: vc.entityId,
        userId,
        detail: { caseId: id },
      },
    });

    return updated;
  }

  async assignCase(id: string, dto: AssignCaseDto, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.SUBMITTED]);

    const reviewerId = dto.reviewerId ?? userId;

    // Validate reviewer exists
    const reviewer = await this.prisma.user.findUnique({ where: { id: reviewerId } });
    if (!reviewer || !reviewer.isActive) {
      throw new NotFoundException(`Reviewer ${reviewerId} not found or is inactive`);
    }

    // Reviewer cannot be creator (4-eyes) — unless dev override
    if (reviewerId === vc.createdById && !(await this.isFourEyesExempt(userId))) {
      throw new ForbiddenException('The reviewer cannot be the case creator (4-eyes principle)');
    }

    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: { status: VerificationCaseStatus.UNDER_REVIEW, reviewedById: reviewerId },
      include: CASE_INCLUDE,
    });

    return updated;
  }

  async reviewCase(id: string, dto: ReviewCaseDto, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.UNDER_REVIEW]);

    const exempt = await this.isFourEyesExempt(userId);
    const override = exempt && (vc.reviewedById !== userId || userId === vc.createdById);

    // Only the assigned reviewer can execute this step (dev override may bypass)
    if (vc.reviewedById !== userId && !exempt) {
      throw new ForbiddenException(
        'Only the assigned reviewer can complete the review step',
      );
    }

    // Reviewer != creator (4-eyes) — unless dev override
    if (userId === vc.createdById && !exempt) {
      throw new ForbiddenException('The reviewer cannot be the case creator (4-eyes principle)');
    }

    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: {
        status: VerificationCaseStatus.PENDING_APPROVAL,
        reviewNotes: dto.reviewNotes,
        reviewedAt: new Date(),
        reviewedById: userId, // record who actually reviewed (accurate under override)
      },
      include: CASE_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.CASE_REVIEWED,
        entityId: vc.entityId,
        userId,
        detail: { caseId: id, ...(override ? { fourEyesOverride: true } : {}) },
      },
    });

    return updated;
  }

  async approveCase(id: string, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.PENDING_APPROVAL]);

    const exempt = await this.isFourEyesExempt(userId);
    const override = exempt && (userId === vc.createdById || userId === vc.reviewedById);

    // Approver cannot be creator (4-eyes) — unless dev override
    if (userId === vc.createdById && !exempt) {
      throw new ForbiddenException('The approver cannot be the case creator (4-eyes principle)');
    }

    // Approver cannot be reviewer (4-eyes) — unless dev override
    if (userId === vc.reviewedById && !exempt) {
      throw new ForbiddenException('The approver cannot be the case reviewer (4-eyes principle)');
    }

    const now = new Date();
    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: {
        status: VerificationCaseStatus.APPROVED,
        approvedById: userId,
        approvedAt: now,
      },
      include: CASE_INCLUDE,
    });

    // Advance entity status
    await this.prisma.entity.update({
      where: { id: vc.entityId },
      data: { status: EntityStatus.APPROVED, kycStatus: KycStatus.APPROVED },
    });

    await this.prisma.auditLog.createMany({
      data: [
        {
          event: AuditEvent.CASE_APPROVED,
          entityId: vc.entityId,
          userId,
          detail: { caseId: id, ...(override ? { fourEyesOverride: true } : {}) },
        },
        {
          event: AuditEvent.ENTITY_STATUS_CHANGED,
          entityId: vc.entityId,
          userId,
          detail: { from: 'PENDING_APPROVAL', to: EntityStatus.APPROVED, caseId: id },
        },
      ],
    });

    return updated;
  }

  async rejectCase(id: string, dto: RejectCaseDto, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [
      VerificationCaseStatus.UNDER_REVIEW,
      VerificationCaseStatus.PENDING_APPROVAL,
    ]);

    const exempt = await this.isFourEyesExempt(userId);
    const override = exempt && userId === vc.createdById;

    // Rejector cannot be creator (4-eyes) — unless dev override
    if (userId === vc.createdById && !exempt) {
      throw new ForbiddenException('The rejector cannot be the case creator (4-eyes principle)');
    }

    const now = new Date();
    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: {
        status: VerificationCaseStatus.REJECTED,
        rejectedById: userId,
        rejectedAt: now,
        rejectionReason: dto.rejectionReason,
      },
      include: CASE_INCLUDE,
    });

    // Set entity status to REJECTED
    await this.prisma.entity.update({
      where: { id: vc.entityId },
      data: { status: EntityStatus.REJECTED, kycStatus: KycStatus.REJECTED },
    });

    await this.prisma.auditLog.createMany({
      data: [
        {
          event: AuditEvent.CASE_REJECTED,
          entityId: vc.entityId,
          userId,
          detail: { caseId: id, reason: dto.rejectionReason, ...(override ? { fourEyesOverride: true } : {}) },
        },
        {
          event: AuditEvent.ENTITY_STATUS_CHANGED,
          entityId: vc.entityId,
          userId,
          detail: { from: vc.status, to: EntityStatus.REJECTED, caseId: id },
        },
      ],
    });

    return updated;
  }

  async withdrawCase(id: string, userId: string) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.DRAFT, VerificationCaseStatus.SUBMITTED]);
    this.requireCreator(vc, userId, 'Only the case creator can withdraw the case');

    const updated = await this.prisma.verificationCase.update({
      where: { id },
      data: { status: VerificationCaseStatus.WITHDRAWN },
      include: CASE_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.CASE_WITHDRAWN,
        entityId: vc.entityId,
        userId,
        detail: { caseId: id },
      },
    });

    return updated;
  }

  // ── Evidence ───────────────────────────────────────────────────────────────

  async uploadEvidence(
    id: string,
    file: Express.Multer.File,
    dto: UploadEvidenceDto,
    userId: string,
  ) {
    const vc = await this.getCaseById(id);
    this.requireStatus(vc, [VerificationCaseStatus.DRAFT], 'Evidence can only be uploaded while the case is in DRAFT status');

    // Check per-file size (also enforced by multer limits, this is a belt-and-suspenders check)
    if (file.size > this.storage.maxFileBytes) {
      throw new BadRequestException(`File size ${file.size} exceeds maximum of 20 MB`);
    }

    // Check total case size
    const existing = await this.prisma.verificationEvidence.findMany({
      where: { caseId: id },
      select: { fileSize: true },
    });
    const usedBytes = existing.reduce((sum, e) => sum + e.fileSize, 0);
    if (usedBytes + file.size > this.storage.maxCaseBytes) {
      throw new BadRequestException(
        `Adding this file would exceed the 100 MB total evidence limit for this case`,
      );
    }

    const evidenceId = randomUUID();
    const { filePath, sha256Hash } = await this.storage.writeEvidence(
      id,
      evidenceId,
      file.originalname,
      file.buffer,
    );

    const evidence = await this.prisma.verificationEvidence.create({
      data: {
        id: evidenceId,
        caseId: id,
        documentType: dto.documentType,
        filePath,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        sha256Hash,
        uploadedById: userId,
        notes: dto.notes ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.EVIDENCE_UPLOADED,
        entityId: vc.entityId,
        userId,
        detail: {
          caseId: id,
          evidenceId,
          fileName: file.originalname,
          fileSize: file.size,
          sha256Hash,
        },
      },
    });

    return evidence;
  }

  async listEvidence(caseId: string) {
    await this.getCaseById(caseId);
    return this.prisma.verificationEvidence.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getEvidenceFile(caseId: string, evidenceId: string) {
    await this.getCaseById(caseId);
    const evidence = await this.prisma.verificationEvidence.findFirst({
      where: { id: evidenceId, caseId },
    });
    if (!evidence) {
      throw new NotFoundException(`Evidence ${evidenceId} not found in case ${caseId}`);
    }
    return { filePath: evidence.filePath, fileName: evidence.fileName };
  }

  async deleteEvidence(caseId: string, evidenceId: string, userId: string) {
    const vc = await this.getCaseById(caseId);
    this.requireStatus(vc, [VerificationCaseStatus.DRAFT], 'Evidence can only be deleted while the case is in DRAFT status');

    const evidence = await this.prisma.verificationEvidence.findFirst({
      where: { id: evidenceId, caseId },
    });
    if (!evidence) {
      throw new NotFoundException(`Evidence ${evidenceId} not found in case ${caseId}`);
    }

    await this.storage.deleteEvidence(evidence.filePath);
    await this.prisma.verificationEvidence.delete({ where: { id: evidenceId } });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.EVIDENCE_DELETED,
        entityId: vc.entityId,
        userId,
        detail: { caseId, evidenceId, fileName: evidence.fileName },
      },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private requireStatus(
    vc: { id: string; status: VerificationCaseStatus },
    allowed: VerificationCaseStatus[],
    message?: string,
  ) {
    if (!allowed.includes(vc.status)) {
      throw new BadRequestException(
        message ??
          `Action not allowed in status ${vc.status}. Required: ${allowed.join(' or ')}`,
      );
    }
  }

  private requireCreator(
    vc: { createdById: string },
    userId: string,
    message: string,
  ) {
    if (vc.createdById !== userId) {
      throw new ForbiddenException(message);
    }
  }
}
