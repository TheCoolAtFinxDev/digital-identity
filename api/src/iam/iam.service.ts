import { Injectable } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ScopeFilter {
  type: RoleScope;
  scopeId?: string;
}

/**
 * A request can be authorised by any one of several narrow grants — a role on the
 * department, on the division above it, or on the organisation entity the chart
 * belongs to. Callers pass the whole set and a match on any of them is enough.
 * A single ScopeFilter is accepted too, and means a set of one.
 */
export type ScopeQuery = ScopeFilter | ScopeFilter[];

/** GLOBAL always applies; narrower grants apply only where the caller asks. */
function buildScopeClause(scope?: ScopeQuery) {
  const filters = scope ? (Array.isArray(scope) ? scope : [scope]) : [];
  if (!filters.length) return { scope: RoleScope.GLOBAL };

  return {
    OR: [
      { scope: RoleScope.GLOBAL },
      ...filters.map((f) => ({ scope: f.type, scopeId: f.scopeId ?? null })),
    ],
  };
}

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string, scope?: ScopeQuery): Promise<string[]> {
    const now = new Date();

    const scopeClause = buildScopeClause(scope);

    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        userId,
        isActive: true,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          scopeClause,
        ],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const codes = new Set<string>();
    for (const a of assignments) {
      for (const rp of a.role.permissions) {
        codes.add(rp.permission.code);
      }
    }
    return Array.from(codes);
  }

  async hasPermission(userId: string, permission: string, scope?: ScopeQuery): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId, scope);
    return permissions.includes(permission);
  }

  // ── Service accounts (F3) — same role/permission model, different principal ──

  async getServiceAccountPermissions(serviceAccountId: string, scope?: ScopeQuery): Promise<string[]> {
    const scopeClause = buildScopeClause(scope);

    const assignments = await this.prisma.serviceAccountRole.findMany({
      where: { serviceAccountId, isActive: true, AND: [scopeClause] },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const codes = new Set<string>();
    for (const a of assignments) {
      for (const rp of a.role.permissions) codes.add(rp.permission.code);
    }
    return Array.from(codes);
  }

  async hasServiceAccountPermission(serviceAccountId: string, permission: string, scope?: ScopeQuery): Promise<boolean> {
    const permissions = await this.getServiceAccountPermissions(serviceAccountId, scope);
    return permissions.includes(permission);
  }
}
