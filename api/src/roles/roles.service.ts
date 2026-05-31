import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
} as const;

const ROLE_WITH_PERMISSIONS_SELECT = {
  ...ROLE_SELECT,
  permissions: {
    include: {
      permission: {
        select: { id: true, code: true, name: true, resource: true, action: true },
      },
    },
  },
} as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.role.findMany({
      select: ROLE_WITH_PERMISSIONS_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: ROLE_WITH_PERMISSIONS_SELECT,
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      select: { id: true, code: true, name: true, description: true, resource: true, action: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }
}
