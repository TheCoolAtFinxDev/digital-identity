import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEvent, Prisma, RoleScope } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AssignSaRoleDto } from './dto/assign-sa-role.dto';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';

const BCRYPT_ROUNDS = 12;

const SA_SELECT = {
  id: true, clientId: true, name: true, description: true,
  isActive: true, createdBy: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class ServiceAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a service account; returns the client secret ONCE (never stored in clear). */
  async create(dto: CreateServiceAccountDto, createdBy?: string) {
    const clientId = 'svc_' + randomBytes(9).toString('hex');     // public id
    const clientSecret = randomBytes(32).toString('base64url');   // shown once
    const secretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

    const sa = await this.prisma.serviceAccount.create({
      data: {
        id: randomUUID(), clientId, secretHash,
        name: dto.name, description: dto.description ?? null,
        isActive: true, createdBy: createdBy ?? null,
      },
      select: SA_SELECT,
    });

    await this.prisma.auditLog.create({
      data: { event: AuditEvent.SERVICE_ACCOUNT_CREATED, userId: createdBy ?? null, detail: { serviceAccountId: sa.id, clientId } },
    });

    // clientSecret returned ONCE — the caller must store it now
    return { ...sa, clientSecret };
  }

  list() {
    return this.prisma.serviceAccount.findMany({ select: SA_SELECT, orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const sa = await this.prisma.serviceAccount.findUnique({ where: { id }, select: SA_SELECT });
    if (!sa) throw new NotFoundException(`Service account ${id} not found`);
    return sa;
  }

  async deactivate(id: string, userId?: string) {
    await this.get(id);
    const sa = await this.prisma.serviceAccount.update({ where: { id }, data: { isActive: false }, select: SA_SELECT });
    await this.prisma.auditLog.create({
      data: { event: AuditEvent.SERVICE_ACCOUNT_DEACTIVATED, userId: userId ?? null, detail: { serviceAccountId: id } },
    });
    return sa;
  }

  /** Rotate the secret; returns the new secret once. Invalidates the old one. */
  async rotateSecret(id: string) {
    await this.get(id);
    const clientSecret = randomBytes(32).toString('base64url');
    const secretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);
    await this.prisma.serviceAccount.update({ where: { id }, data: { secretHash } });
    return { id, clientSecret };
  }

  async assignRole(id: string, dto: AssignSaRoleDto, assignedBy?: string) {
    await this.get(id);
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);
    const scope = dto.scope ?? RoleScope.GLOBAL;

    const assignment = await this.prisma.serviceAccountRole.create({
      data: {
        id: randomUUID(), serviceAccountId: id, roleId: dto.roleId,
        scope, scopeId: dto.scopeId ?? null, isActive: true, assignedBy: assignedBy ?? 'system',
      },
      include: { role: { select: { id: true, code: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: { event: AuditEvent.ROLE_ASSIGNED, userId: assignedBy ?? null, detail: { serviceAccountId: id, roleCode: role.code, scope, scopeId: dto.scopeId ?? null } },
    });
    return assignment;
  }

  getRoles(id: string) {
    return this.prisma.serviceAccountRole.findMany({
      where: { serviceAccountId: id, isActive: true },
      include: { role: { select: { id: true, code: true, name: true } } },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async revokeRole(id: string, assignmentId: string, userId?: string) {
    const a = await this.prisma.serviceAccountRole.findFirst({
      where: { id: assignmentId, serviceAccountId: id }, include: { role: { select: { code: true } } },
    });
    if (!a) throw new NotFoundException(`Role assignment ${assignmentId} not found for service account ${id}`);
    if (!a.isActive) return;
    await this.prisma.serviceAccountRole.update({ where: { id: assignmentId }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: { event: AuditEvent.ROLE_REVOKED, userId: userId ?? null, detail: { serviceAccountId: id, roleCode: a.role.code, assignmentId } },
    });
  }
}
