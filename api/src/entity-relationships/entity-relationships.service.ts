import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEvent, Prisma, RelationshipStatus, RelationshipType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { EntityRelationshipsQueryDto, RelationshipQueryDto } from './dto/relationship-query.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';

// Only these types may carry an ownershipPercent
const OWNERSHIP_TYPES = new Set<RelationshipType>([
  RelationshipType.SHAREHOLDER_OF,
  RelationshipType.BENEFICIAL_OWNER_OF,
]);

const INCLUDE_ENTITIES = {
  subjectEntity: { select: { id: true, name: true, entityType: true } },
  objectEntity: { select: { id: true, name: true, entityType: true } },
} as const;

@Injectable()
export class EntityRelationshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRelationship(dto: CreateRelationshipDto, createdByUserId: string) {
    // ── subject ≠ object ───────────────────────────────────────────────────
    if (dto.subjectEntityId === dto.objectEntityId) {
      throw new BadRequestException('subjectEntityId and objectEntityId must be different entities');
    }

    // ── both entities must exist ───────────────────────────────────────────
    const entities = await this.prisma.entity.findMany({
      where: { id: { in: [dto.subjectEntityId, dto.objectEntityId] } },
      select: { id: true },
    });
    if (entities.length < 2) {
      const found = new Set(entities.map((e) => e.id));
      const missing = [dto.subjectEntityId, dto.objectEntityId].filter((id) => !found.has(id));
      throw new NotFoundException(`Entity not found: ${missing.join(', ')}`);
    }

    // ── ownership rules ────────────────────────────────────────────────────
    this.validateOwnership(dto.relationshipType, dto.ownershipPercent);

    // ── date range ─────────────────────────────────────────────────────────
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    if (dto.endDate) {
      const endDate = new Date(dto.endDate);
      if (endDate < startDate) {
        throw new BadRequestException('endDate must not be before startDate');
      }
    }

    const rel = await this.prisma.entityRelationship.create({
      data: {
        id: randomUUID(),
        subjectEntityId: dto.subjectEntityId,
        objectEntityId: dto.objectEntityId,
        relationshipType: dto.relationshipType,
        status: RelationshipStatus.ACTIVE,
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        ownershipPercent: dto.ownershipPercent ?? null,
        notes: dto.notes ?? null,
        createdById: createdByUserId,
      },
      include: INCLUDE_ENTITIES,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.RELATIONSHIP_CREATED,
        userId: createdByUserId,
        detail: {
          relationshipId: rel.id,
          subjectEntityId: dto.subjectEntityId,
          objectEntityId: dto.objectEntityId,
          relationshipType: dto.relationshipType,
        },
      },
    });

    return rel;
  }

  async listRelationships(query: RelationshipQueryDto) {
    const where: Prisma.EntityRelationshipWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.relationshipType ? { relationshipType: query.relationshipType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.entityRelationship.findMany({
        where,
        include: INCLUDE_ENTITIES,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.entityRelationship.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async getRelationshipById(id: string) {
    const rel = await this.prisma.entityRelationship.findUnique({
      where: { id },
      include: INCLUDE_ENTITIES,
    });
    if (!rel) throw new NotFoundException(`Relationship ${id} not found`);
    return rel;
  }

  async listByEntity(entityId: string, query: EntityRelationshipsQueryDto) {
    // Verify entity exists
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found`);

    const directionFilter: Prisma.EntityRelationshipWhereInput =
      query.direction === 'subject'
        ? { subjectEntityId: entityId }
        : query.direction === 'object'
        ? { objectEntityId: entityId }
        : { OR: [{ subjectEntityId: entityId }, { objectEntityId: entityId }] };

    const where: Prisma.EntityRelationshipWhereInput = {
      ...directionFilter,
      ...(query.status ? { status: query.status } : {}),
      ...(query.relationshipType ? { relationshipType: query.relationshipType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.entityRelationship.findMany({
        where,
        include: INCLUDE_ENTITIES,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.entityRelationship.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async updateRelationship(id: string, dto: UpdateRelationshipDto, userId?: string) {
    const rel = await this.getRelationshipById(id);

    // ── date range validation ──────────────────────────────────────────────
    const newStart = dto.startDate ? new Date(dto.startDate) : rel.startDate;
    const newEnd = dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : rel.endDate;
    if (newEnd && newEnd < newStart) {
      throw new BadRequestException('endDate must not be before startDate');
    }

    // ── ownership rules (type unchanged) ──────────────────────────────────
    if (dto.ownershipPercent !== undefined) {
      this.validateOwnership(rel.relationshipType, dto.ownershipPercent);
    }

    // Build before/after diff for audit
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (dto.startDate !== undefined) changes.startDate = { from: rel.startDate, to: dto.startDate };
    if (dto.endDate !== undefined) changes.endDate = { from: rel.endDate, to: dto.endDate };
    if (dto.ownershipPercent !== undefined) changes.ownershipPercent = { from: rel.ownershipPercent, to: dto.ownershipPercent };
    if (dto.notes !== undefined) changes.notes = { from: rel.notes, to: dto.notes };

    const updated = await this.prisma.entityRelationship.update({
      where: { id },
      data: {
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
        ...(dto.ownershipPercent !== undefined ? { ownershipPercent: dto.ownershipPercent } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: INCLUDE_ENTITIES,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.RELATIONSHIP_UPDATED,
        userId: userId ?? null,
        detail: {
          relationshipId: id,
          subjectEntityId: rel.subjectEntityId,
          objectEntityId: rel.objectEntityId,
          relationshipType: rel.relationshipType,
          changes,
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async deactivateRelationship(id: string, userId: string) {
    const rel = await this.getRelationshipById(id);

    const now = new Date();
    const updated = await this.prisma.entityRelationship.update({
      where: { id },
      data: {
        status: RelationshipStatus.INACTIVE,
        endDate: rel.endDate ?? now,
      },
      include: INCLUDE_ENTITIES,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.RELATIONSHIP_STATUS_CHANGED,
        userId,
        detail: {
          relationshipId: id,
          from: rel.status,
          to: RelationshipStatus.INACTIVE,
        },
      },
    });

    return updated;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private validateOwnership(type: RelationshipType, percent?: number) {
    if (percent !== undefined && percent !== null) {
      if (!OWNERSHIP_TYPES.has(type)) {
        throw new BadRequestException(
          `ownershipPercent is only allowed for SHAREHOLDER_OF and BENEFICIAL_OWNER_OF relationships`,
        );
      }
    }
  }
}
