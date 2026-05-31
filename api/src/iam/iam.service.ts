import { Injectable } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ScopeFilter {
  type: RoleScope;
  scopeId?: string;
}

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string, scope?: ScopeFilter): Promise<string[]> {
    const now = new Date();

    const scopeClause = scope
      ? {
          OR: [
            { scope: RoleScope.GLOBAL },
            { scope: scope.type, scopeId: scope.scopeId ?? null },
          ],
        }
      : { scope: RoleScope.GLOBAL };

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

  async hasPermission(userId: string, permission: string, scope?: ScopeFilter): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId, scope);
    return permissions.includes(permission);
  }
}
