import { Injectable, BadRequestException } from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditLogPageDto } from './dto/audit-log-response.dto';

const VALID_EVENTS = new Set<string>(Object.values(AuditEvent));
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async query(q: AuditQueryDto): Promise<AuditLogPageDto> {
    if (q.event && !VALID_EVENTS.has(q.event)) {
      throw new BadRequestException(`Unknown event type: ${q.event}`);
    }

    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where = {
      ...(q.event ? { event: q.event as AuditEvent } : {}),
      ...(q.requestId ? { requestId: q.requestId } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit };
  }
}
