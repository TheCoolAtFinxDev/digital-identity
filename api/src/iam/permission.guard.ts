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
import { ScopeResolverService } from './scope-resolver.service';
import { SCOPE_KEY, ScopeDeclaration } from './scope.decorator';

/**
 * Resolves @RequirePermission, in two stages.
 *
 * 1. Ask for the permission organisation-wide. A GLOBAL grant answers most
 *    requests — every identity operator holds one — and costs exactly the single
 *    query it always did.
 * 2. Only if that fails, resolve what the route says it acts on and ask again
 *    with the narrow grants that would cover it. A department-limited role
 *    reaches this path; nothing else pays for it.
 *
 * The order matters for more than speed: stage 1 is the behaviour that shipped
 * in Phase 1-B, so nothing that worked before can start failing. Scoped grants
 * are strictly additional authority, never a new restriction.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly iam: IamService,
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeResolverService,
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

    const isService = principalType === 'service' && serviceAccountId;
    if (!isService && !userId) {
      // Old-format token (no userId) or bypassed JwtAuthGuard
      throw new ForbiddenException('Permission check requires a valid session token');
    }

    const check = (scope?: Parameters<IamService['hasPermission']>[2]) =>
      isService
        ? this.iam.hasServiceAccountPermission(serviceAccountId!, permission, scope)
        : this.iam.hasPermission(userId!, permission, scope);

    // Stage 1 — organisation-wide.
    let allowed = await check();

    // Stage 2 — narrow grants over whatever this route acts on.
    let scopedVia: string[] | null = null;
    if (!allowed) {
      const declared = this.reflector.getAllAndOverride<
        ScopeDeclaration | ScopeDeclaration[]
      >(SCOPE_KEY, [context.getHandler(), context.getClass()]);

      // A missing declaration cannot happen in a booted app — ScopeCoverageService
      // refuses to start without one on every guarded route. Treating it as
      // GLOBAL-only here keeps the guard closed if that check is ever bypassed.
      const declarations = declared
        ? Array.isArray(declared)
          ? declared
          : [declared]
        : [];

      if (declarations.length && declarations.every((d) => d.target !== 'GLOBAL')) {
        allowed = await this.satisfiesEvery(declarations, req, check);
        if (allowed) scopedVia = declarations.map((d) => d.target);
      }
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

    // Record which narrow grant carried the request. Someone reading the audit
    // trail after the fact needs to see that a department-limited role acted,
    // not just that the call succeeded.
    if (scopedVia) req.scopeGrant = { permission, targets: scopedVia };

    return true;
  }

  /**
   * Every declaration the request actually populates must be satisfied.
   *
   * A route that moves a unit names both ends; holding authority over the unit
   * you are moving is not permission to graft it onto someone else's division.
   * A declaration the request leaves empty describes nothing and is skipped — a
   * rename names no destination — but one that names a target which cannot be
   * resolved refuses the request outright rather than being skipped, so a bad id
   * can never be the thing that removes a check.
   */
  private async satisfiesEvery(
    declarations: ScopeDeclaration[],
    req: any,
    check: (scope?: any) => Promise<boolean>,
  ): Promise<boolean> {
    let applicable = 0;

    for (const declaration of declarations) {
      const candidates = await this.scopes.resolve(declaration, req);
      if (candidates === null) continue; // not named in this request
      if (!candidates.length) return false; // named but unresolvable — fail closed

      applicable++;
      if (!(await check(candidates))) return false;
    }

    // Nothing the route declared appears in this request, so there is nothing a
    // narrow grant could have covered. Only the global check could have admitted
    // it, and that has already failed.
    return applicable > 0;
  }
}
