import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEvent, ObjectType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDto } from './dto/create-object.dto';

const VALID_OBJECT_TYPES = new Set<string>(Object.values(ObjectType));

@Injectable()
export class ObjectService {
  constructor(private readonly prisma: PrismaService) {}

  async listObjects(page: number, limit: number, entityId?: string, objectType?: string) {
    const where: Record<string, unknown> = {};
    if (entityId) where['entityId'] = entityId;
    if (objectType) where['objectType'] = objectType as ObjectType;
    const [total, data] = await Promise.all([
      this.prisma.objectRecord.count({ where }),
      this.prisma.objectRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { entity: { select: { name: true } } },
      }),
    ]);
    return { data: data.map((r) => this.toResponse(r)), total, page, limit };
  }

  async createObject(dto: CreateObjectDto, userId?: string) {
    if (!dto.objectType || !VALID_OBJECT_TYPES.has(dto.objectType)) {
      throw new BadRequestException(
        `Invalid objectType. Must be one of: ${[...VALID_OBJECT_TYPES].join(', ')}`,
      );
    }

    if (!dto.reference?.trim()) {
      throw new BadRequestException('reference is required');
    }

    if (dto.entityId) {
      const entity = await this.prisma.entity.findUnique({ where: { id: dto.entityId } });
      if (!entity) {
        throw new BadRequestException(`Entity ${dto.entityId} not found`);
      }
    }

    const record = await this.prisma.objectRecord.create({
      data: {
        objectType: dto.objectType as ObjectType,
        reference: dto.reference.trim(),
        entityId: dto.entityId ?? null,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: { entity: { select: { name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.OBJECT_CREATED,
        entityId: record.entityId,
        userId: userId ?? null,
        detail: { objectId: record.id, objectType: record.objectType, reference: record.reference },
      },
    });

    return this.toResponse(record);
  }

  async getObject(id: string, userId?: string) {
    const record = await this.prisma.objectRecord.findUnique({
      where: { id },
      include: { entity: { select: { name: true } } },
    });

    if (!record) {
      throw new NotFoundException(`Object ${id} not found`);
    }

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.OBJECT_VIEWED,
        entityId: record.entityId,
        userId: userId ?? null,
        detail: { objectId: record.id },
      },
    });

    return this.toResponse(record);
  }

  private toResponse(record: any) {
    const { entity, ...rest } = record;
    return { ...rest, entityName: entity?.name ?? null };
  }
}
