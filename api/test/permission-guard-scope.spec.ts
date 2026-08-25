import { ForbiddenException } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PermissionGuard } from '../src/iam/permission.guard';
import { PERMISSION_KEY } from '../src/iam/permission.decorator';
import { SCOPE_KEY, ScopeDeclaration } from '../src/iam/scope.decorator';

/**
 * The guard resolves in two stages, and the order is a compatibility guarantee
 * as much as an optimisation: stage one is exactly the check that shipped in
 * Phase 1-B, so a scoped grant can only ever add authority. These tests pin that
 * down — a global holder must never trigger a scope lookup, and a request that
 * fails both stages must still be refused and audited.
 */

type Grant = { permission: string; scope?: { type: RoleScope; scopeId: string } };

function build(opts: {
  /** null means the route carries no @RequirePermission at all. */
  permission?: string | null;
  declaration?: ScopeDeclaration | ScopeDeclaration[];
  grants: Grant[];
  principal?: { userId?: string; principalType?: string; serviceAccountId?: string };
  candidates?: Array<{ type: RoleScope; scopeId: string }>;
  /** Per-declaration resolution, for routes that declare more than one target. */
  resolveBy?: (d: ScopeDeclaration) => Array<{ type: RoleScope; scopeId: string }> | null;
}) {
  const audited: any[] = [];

  const holds = (permission: string, scope?: any) => {
    const filters = scope ? (Array.isArray(scope) ? scope : [scope]) : [];
    return opts.grants.some((g) => {
      if (g.permission !== permission) return false;
      if (!g.scope) return true; // a GLOBAL grant answers everything
      return filters.some(
        (f: any) => f.type === g.scope!.type && f.scopeId === g.scope!.scopeId,
      );
    });
  };

  const iam = {
    hasPermission: jest.fn(async (_u: string, p: string, s?: any) => holds(p, s)),
    hasServiceAccountPermission: jest.fn(async (_s: string, p: string, sc?: any) => holds(p, sc)),
  };

  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === PERMISSION_KEY
        ? (opts.permission === null ? undefined : (opts.permission ?? 'orgunit:update'))
        : key === SCOPE_KEY
          ? opts.declaration
          : undefined,
    ),
  };

  const prisma = {
    auditLog: { create: jest.fn(async ({ data }: any) => audited.push(data)) },
  };

  const scopes = {
    resolve: jest.fn(async (d: ScopeDeclaration) =>
      opts.resolveBy ? opts.resolveBy(d) : (opts.candidates ?? null),
    ),
  };

  const req: any = {
    user: opts.principal ?? { userId: 'user-1', principalType: 'user' },
    url: '/v1/org-units/u-fin',
    method: 'PATCH',
    params: { id: 'u-fin' },
    body: {},
  };

  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  };

  const guard = new PermissionGuard(
    reflector as any,
    iam as any,
    prisma as any,
    scopes as any,
  );

  return { guard, ctx, req, iam, scopes, audited };
}

const UNIT_DECL: ScopeDeclaration = { target: 'ORG_UNIT', from: 'param', name: 'id' };
const FIN = { type: RoleScope.ORG_UNIT, scopeId: 'u-fin' };
const TECH = { type: RoleScope.ORG_UNIT, scopeId: 'u-tech' };

describe('PermissionGuard — stage one, organisation-wide', () => {
  it('admits a global grant', async () => {
    const t = build({ declaration: UNIT_DECL, grants: [{ permission: 'orgunit:update' }] });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('does not resolve scope at all when the global grant answers', async () => {
    const t = build({ declaration: UNIT_DECL, grants: [{ permission: 'orgunit:update' }] });
    await t.guard.canActivate(t.ctx);
    expect(t.scopes.resolve).not.toHaveBeenCalled();
    expect(t.iam.hasPermission).toHaveBeenCalledTimes(1);
  });

  it('passes a route with no permission requirement straight through', async () => {
    const t = build({ permission: null, grants: [] });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });
});

describe('PermissionGuard — stage two, scoped grants', () => {
  it('admits a grant on the unit itself', async () => {
    const t = build({
      declaration: UNIT_DECL,
      candidates: [FIN, TECH],
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('admits a grant on a unit above the target', async () => {
    const t = build({
      declaration: UNIT_DECL,
      candidates: [FIN, TECH],
      grants: [{ permission: 'orgunit:update', scope: TECH }],
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('refuses a grant on a unit the resolver did not offer', async () => {
    const t = build({
      declaration: UNIT_DECL,
      candidates: [FIN, TECH],
      grants: [
        { permission: 'orgunit:update', scope: { type: RoleScope.ORG_UNIT, scopeId: 'u-hr' } },
      ],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records which declaration carried the request', async () => {
    const t = build({
      declaration: UNIT_DECL,
      candidates: [FIN],
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await t.guard.canActivate(t.ctx);
    expect(t.req.scopeGrant).toEqual({ permission: 'orgunit:update', targets: ['ORG_UNIT'] });
  });

  it('leaves no scope marker when a global grant carried it', async () => {
    const t = build({ declaration: UNIT_DECL, grants: [{ permission: 'orgunit:update' }] });
    await t.guard.canActivate(t.ctx);
    expect(t.req.scopeGrant).toBeUndefined();
  });
});

describe('PermissionGuard — refusals', () => {
  it('refuses and audits when neither stage admits', async () => {
    const t = build({ declaration: UNIT_DECL, candidates: [FIN], grants: [] });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.audited).toHaveLength(1);
    expect(t.audited[0].detail).toMatchObject({
      permissionCode: 'orgunit:update',
      route: '/v1/org-units/u-fin',
      method: 'PATCH',
    });
  });

  it('refuses a GLOBAL-declared route no matter what scoped grants exist', async () => {
    const t = build({
      declaration: { target: 'GLOBAL' },
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.scopes.resolve).not.toHaveBeenCalled();
  });

  it('stays closed on a guarded route whose declaration is missing', async () => {
    const t = build({ declaration: undefined, candidates: [FIN], grants: [{ permission: 'orgunit:update', scope: FIN }] });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.scopes.resolve).not.toHaveBeenCalled();
  });

  it('refuses a token that carries no principal at all', async () => {
    const t = build({ declaration: UNIT_DECL, grants: [], principal: {} });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PermissionGuard — service principals', () => {
  it('resolves a service account through the same two stages', async () => {
    const t = build({
      declaration: UNIT_DECL,
      candidates: [FIN],
      grants: [{ permission: 'orgunit:update', scope: FIN }],
      principal: { principalType: 'service', serviceAccountId: 'sa-1' },
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.iam.hasServiceAccountPermission).toHaveBeenCalledTimes(2);
    expect(t.iam.hasPermission).not.toHaveBeenCalled();
  });
});

describe('ScopeCoverageService — the declaration is mandatory', () => {
  const { ScopeCoverageService } = require('../src/iam/scope-coverage.service');

  function coverage(routes: Array<{ method: string; permission?: string; declaration?: any }>) {
    class Controller {}
    const instance = new Controller();
    const prototype = Object.getPrototypeOf(instance);
    for (const r of routes) (prototype as any)[r.method] = () => undefined;

    const byMethod = new Map(routes.map((r) => [r.method, r]));
    const discovery = { getControllers: () => [{ instance, metatype: Controller }] };
    const scanner = { getAllMethodNames: () => routes.map((r) => r.method) };
    const reflector = {
      getAllAndOverride: (key: string, [handler]: any[]) => {
        const name = routes.find((r) => (prototype as any)[r.method] === handler)?.method;
        const route = name ? byMethod.get(name) : undefined;
        return key === PERMISSION_KEY ? route?.permission : route?.declaration;
      },
    };
    return new ScopeCoverageService(discovery as any, scanner as any, reflector as any);
  }

  it('starts when every guarded route has declared its scope', () => {
    const svc = coverage([
      { method: 'a', permission: 'orgunit:update', declaration: UNIT_DECL },
      { method: 'b', permission: 'user:create', declaration: { target: 'GLOBAL' } },
      { method: 'c' }, // unguarded — needs no declaration
    ]);
    expect(() => svc.onApplicationBootstrap()).not.toThrow();
  });

  it('refuses to start when a guarded route has not', () => {
    const svc = coverage([
      { method: 'a', permission: 'orgunit:update', declaration: UNIT_DECL },
      { method: 'b', permission: 'stamp:create' },
    ]);
    expect(() => svc.onApplicationBootstrap()).toThrow(/do not declare their scope/);
    expect(() => svc.onApplicationBootstrap()).toThrow(/Controller\.b \(stamp:create\)/);
  });
});

describe('PermissionGuard — routes that name two targets', () => {
  const MOVE: ScopeDeclaration[] = [
    { target: 'ORG_UNIT', from: 'param', name: 'id' },
    { target: 'ORG_UNIT', from: 'body', name: 'parentId' },
  ];
  const ROOT = { type: RoleScope.ORG_UNIT, scopeId: 'u-root' };

  /** A rename: the body names no destination, so only the unit matters. */
  const renaming = (d: ScopeDeclaration) => ('from' in d && d.from === 'param' ? [FIN] : null);
  /** A move: both ends are named. */
  const moving = (d: ScopeDeclaration) => ('from' in d && d.from === 'param' ? [FIN] : [ROOT]);

  it('admits a rename on the strength of the unit alone', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: renaming,
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('refuses a move when the caller holds only the source', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: moving,
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a move when the caller holds only the destination', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: moving,
      grants: [{ permission: 'orgunit:update', scope: ROOT }],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admits a move when the caller holds both ends', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: moving,
      grants: [
        { permission: 'orgunit:update', scope: FIN },
        { permission: 'orgunit:update', scope: ROOT },
      ],
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('refuses when a named target cannot be resolved at all', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: (d) => ('from' in d && d.from === 'param' ? [FIN] : []),
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the request populates none of the declared targets', async () => {
    const t = build({
      declaration: MOVE,
      resolveBy: () => null,
      grants: [{ permission: 'orgunit:update', scope: FIN }],
    });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
