import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IamService } from './iam.service';
import { PERMISSION_KEY } from './permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly iam: IamService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permission requirement on this route — pass through
    if (!permission) return true;

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;

    if (!userId) {
      // Authenticated via old-format token (no userId) or request bypassed JwtAuthGuard
      throw new ForbiddenException('Permission check requires a valid session token');
    }

    const allowed = await this.iam.hasPermission(userId, permission);

    if (!allowed) {
      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.PERMISSION_CHECK_FAILED,
          userId,
          detail: {
            permissionCode: permission,
            route: req.url,
            method: req.method,
          },
        },
      });
      throw new ForbiddenException(`Permission required: ${permission}`);
    }

    return true;
  }
}
