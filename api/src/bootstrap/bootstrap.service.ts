import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { access, constants, mkdir } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 12;
const ADMIN_ROLE_CODE = 'ADMIN';

export const EVIDENCE_STORAGE_ROOT =
  process.env.EVIDENCE_STORAGE_PATH ?? '/app/storage/evidence';

export const STAMP_STORAGE_ROOT = process.env.STAMP_STORAGE_PATH ?? '/app/storage/stamps';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.checkStorage(EVIDENCE_STORAGE_ROOT, 'Evidence', 'Evidence upload/download');
    await this.checkStorage(STAMP_STORAGE_ROOT, 'Stamp', 'Document stamping');
    await this.seedAdminUser();
  }

  private async checkStorage(root: string, label: string, feature: string) {
    try {
      await mkdir(root, { recursive: true });
      await access(root, constants.W_OK);
      this.logger.log(`${label} storage ready: ${root}`);
    } catch (err: any) {
      this.logger.warn(
        `${label} storage not writable at ${root}: ${err.message}. ` +
          `${feature} will fail until the mount is available.`,
      );
    }
  }

  private async seedAdminUser() {
    const username = process.env.AUTH_USERNAME ?? 'admin';
    const password = process.env.AUTH_PASSWORD ?? 'change_me_admin_password';

    const adminRole = await this.prisma.role.findUnique({ where: { code: ADMIN_ROLE_CODE } });
    if (!adminRole) {
      this.logger.error('Bootstrap: ADMIN role not found — run migrations first');
      return;
    }

    let user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          username,
          email: `${username}@system.local`,
          passwordHash,
          displayName: 'System Administrator',
          isActive: true,
          createdBy: 'system',
        },
      });
      this.logger.log(`Bootstrap: created admin user "${username}" (${user.id})`);

      await this.prisma.auditLog.create({
        data: {
          event: 'USER_CREATED',
          userId: user.id,
          detail: { username, source: 'bootstrap' },
        },
      });
    } else {
      this.logger.log(`Bootstrap: admin user "${username}" already exists (${user.id})`);
    }

    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, roleId: adminRole.id, scope: RoleScope.GLOBAL, isActive: true },
    });

    if (!existing) {
      await this.prisma.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          roleId: adminRole.id,
          scope: RoleScope.GLOBAL,
          assignedBy: user.id,
          isActive: true,
        },
      });
      this.logger.log(`Bootstrap: assigned ADMIN role to "${username}"`);

      await this.prisma.auditLog.create({
        data: {
          event: 'ROLE_ASSIGNED',
          userId: user.id,
          detail: { roleCode: ADMIN_ROLE_CODE, scope: 'GLOBAL', source: 'bootstrap' },
        },
      });
    }
  }
}
