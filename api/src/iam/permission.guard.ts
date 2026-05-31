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
    const principalType: string = req.user?.principalType ?? 'user';
    const userId: string | undefined = req.user?.userId;
    const serviceAccountId: string | undefined = req.user?.serviceAccountId;

    // Resolve permission for either principal type (user or service account)
    let allowed = false;
    if (principalType === 'service' && serviceAccountId) {
      allowed = await this.iam.hasServiceAccountPermission(serviceAccountId, permission);
    } else if (userId) {
      allowed = await this.iam.hasPermission(userId, permission);
    } else {
      // Old-format token (no userId) or bypassed JwtAuthGuard
      throw new ForbiddenException('Permission check requires a valid session token');
    }

    if (!allowed) {
      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.PERMISSION_CHECK_FAILED,
          userId: userId ?? null,
          detail: {
            permissionCode: permission,
            route: req.url,
            method: req.method,
            principalType,
            serviceAccountId: serviceAccountId ?? null,
          },
        },
      });
      throw new ForbiddenException(`Permission required: ${permission}`);
    }

    return true;
  }
}
