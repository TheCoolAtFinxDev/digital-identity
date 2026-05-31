import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEvent, EntityType, KycStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateKycStatusDto } from './dto/update-kyc-status.dto';

const VALID_KYC_STATUSES = new Set<string>(['PENDING', 'APPROVED', 'REJECTED']);

@Injectable()
export class EntityService {
  constructor(private readonly prisma: PrismaService) {}

  async listEntities(page: number, limit: number, kycStatus?: string) {
    const where = kycStatus ? { kycStatus: kycStatus as KycStatus } : {};
    const [total, data] = await Promise.all([
      this.prisma.entity.count({ where }),
      this.prisma.entity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { requests: true } } },
      }),
    ]);
    return { data: data.map((e) => this.toResponse(e)), total, page, limit };
  }

  async createEntity(dto: CreateEntityDto, userId?: string) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Entity name is required');
    }
    if (!dto.country?.trim()) {
      throw new BadRequestException('Entity country is required');
    }

    const entityType = dto.entityType ?? EntityType.ORGANISATION;

    const entity = await this.prisma.entity.create({
      data: {
        name: dto.name.trim(),
        country: dto.country.trim().toUpperCase(),
        entityType,
      },
      include: { _count: { select: { requests: true } } },
    });

    // Two audit events: creation record + explicit type assignment
    await this.prisma.auditLog.createMany({
      data: [
        {
          event: AuditEvent.ENTITY_CREATED,
          entityId: entity.id,
          userId: userId ?? null,
          detail: { name: entity.name, country: entity.country },
        },
        {
          event: AuditEvent.ENTITY_TYPE_SET,
          entityId: entity.id,
          userId: userId ?? null,
          detail: { entityType, explicit: dto.entityType !== undefined },
        },
      ],
    });

    return this.toResponse(entity);
  }

  async getEntity(id: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { id },
      include: { _count: { select: { requests: true } } },
    });

    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }

    return this.toResponse(entity);
  }

  async updateKycStatus(id: string, dto: UpdateKycStatusDto, userId?: string) {
    if (!VALID_KYC_STATUSES.has(dto.kycStatus)) {
      throw new BadRequestException(`Invalid KYC status: ${dto.kycStatus}`);
    }

    const existing = await this.prisma.entity.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Entity ${id} not found`);
    }

    const entity = await this.prisma.entity.update({
      where: { id },
      data: { kycStatus: dto.kycStatus as KycStatus },
      include: { _count: { select: { requests: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.KYC_STATUS_UPDATED,
        entityId: id,
        userId: userId ?? null,
        detail: { from: existing.kycStatus, to: dto.kycStatus },
      },
    });

    return this.toResponse(entity);
  }

  private toResponse(entity: any) {
    const { _count, ...rest } = entity;
    return { ...rest, requestCount: _count?.requests ?? 0 };
  }
}
