import { RoleScope } from '@prisma/client';
import { ScopeResolverService } from '../src/iam/scope-resolver.service';
import { ScopeDeclaration } from '../src/iam/scope.decorator';

/**
 * The guard's second stage is only as safe as what the resolver returns. Two
 * properties matter more than the rest and neither is visible end-to-end:
 * authority flows down the org chart and never up, and a target that cannot be
 * found produces no candidates at all rather than a permissive fallback.
 */

/** Finance sits under Technology, which sits under the root of entity ent-1. */
const CHART: Record<string, { id: string; parentId: string | null; entityId: string }> = {
  'u-root': { id: 'u-root', parentId: null, entityId: 'ent-1' },
  'u-tech': { id: 'u-tech', parentId: 'u-root', entityId: 'ent-1' },
  'u-fin': { id: 'u-fin', parentId: 'u-tech', entityId: 'ent-1' },
  'u-hr': { id: 'u-hr', parentId: 'u-root', entityId: 'ent-1' },
};

function stubPrisma(over: Record<string, any> = {}) {
  return {
    orgUnit: {
      findUnique: jest.fn(async ({ where }: any) => CHART[where.id] ?? null),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === 'user-fin'
          ? { orgUnitId: 'u-fin', personEntityId: 'ent-person' }
          : where.id === 'user-bare'
            ? { orgUnitId: null, personEntityId: null }
            : null,
      ),
    },
    verificationCase: { findUnique: jest.fn(async () => null) },
    certificateRequest: { findUnique: jest.fn(async () => null) },
    certificate: { findUnique: jest.fn(async () => null) },
    entityRelationship: { findUnique: jest.fn(async () => null) },
    stampedDocument: { findUnique: jest.fn(async () => null) },
    ...over,
  } as any;
}

const req = (params: any = {}, body: any = {}) => ({ params, body });
const resolver = (prisma = stubPrisma()) => new ScopeResolverService(prisma);

const units = (c: Array<{ type: RoleScope; scopeId: string }> | null) =>
  (c ?? []).filter((x) => x.type === RoleScope.ORG_UNIT).map((x) => x.scopeId);

describe('scope resolution — org units', () => {
  const decl: ScopeDeclaration = { target: 'ORG_UNIT', from: 'param', name: 'id' };

  it('accepts a grant on the unit itself and on every unit above it', async () => {
    const out = await resolver().resolve(decl, req({ id: 'u-fin' }));
    expect(units(out)).toEqual(['u-fin', 'u-tech', 'u-root']);
  });

  it('never accepts a grant on a unit below the target', async () => {
    const out = await resolver().resolve(decl, req({ id: 'u-tech' }));
    expect(units(out)).toEqual(['u-tech', 'u-root']);
    expect(units(out)).not.toContain('u-fin');
  });

  it('never accepts a grant on a sibling branch', async () => {
    const out = await resolver().resolve(decl, req({ id: 'u-fin' }));
    expect(units(out)).not.toContain('u-hr');
  });

  it('adds the organisation entity the chart hangs off', async () => {
    const out = await resolver().resolve(decl, req({ id: 'u-fin' }));
    expect(out ?? []).toContainEqual({ type: RoleScope.ORGANISATION, scopeId: 'ent-1' });
    expect(out ?? []).toContainEqual({ type: RoleScope.ENTITY, scopeId: 'ent-1' });
  });

  it('yields nothing for a unit that does not exist', async () => {
    expect(await resolver().resolve(decl, req({ id: 'nope' }))).toEqual([]);
  });

  it('reports "not named here" when the identifier is absent from the request', async () => {
    // null, not [] — an absent field describes nothing, while an empty list
    // means a named target that could not be found. The guard treats them
    // differently: skip versus refuse.
    expect(await resolver().resolve(decl, req({}))).toBeNull();
  });

  it('stops walking a chart that has been corrupted into a cycle', async () => {
    const cyclic = stubPrisma({
      orgUnit: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 'a'
            ? { id: 'a', parentId: 'b', entityId: 'ent-1' }
            : { id: 'b', parentId: 'a', entityId: 'ent-1' },
        ),
      },
    });
    const out = await resolver(cyclic).resolve(decl, req({ id: 'a' }));
    expect(units(out).sort()).toEqual(['a', 'b']);
  });
});

describe('scope resolution — other targets', () => {
  it('treats GLOBAL as "only a global grant will do"', async () => {
    expect(await resolver().resolve({ target: 'GLOBAL' }, req({ id: 'u-fin' }))).toEqual([]);
  });

  it('reaches a user through their unit and their person entity', async () => {
    const out = await resolver().resolve(
      { target: 'USER', from: 'param', name: 'id' },
      req({ id: 'user-fin' }),
    );
    expect(units(out)).toEqual(['u-fin', 'u-tech', 'u-root']);
    expect(out ?? []).toContainEqual({ type: RoleScope.ENTITY, scopeId: 'ent-person' });
  });

  it('yields nothing for a user who is on no chart and has no person entity', async () => {
    const out = await resolver().resolve(
      { target: 'USER', from: 'param', name: 'id' },
      req({ id: 'user-bare' }),
    );
    expect(out).toEqual([]);
  });

  it('walks a certificate to the entity behind its request', async () => {
    const prisma = stubPrisma({
      certificate: {
        findUnique: jest.fn(async () => ({ request: { entityId: 'ent-9' } })),
      },
    });
    const out = await resolver(prisma).resolve(
      { target: 'CERTIFICATE', from: 'param', name: 'serial' },
      req({ serial: '101A' }),
    );
    expect(out ?? []).toContainEqual({ type: RoleScope.ENTITY, scopeId: 'ent-9' });
  });

  it('accepts a grant over either party to a relationship', async () => {
    const prisma = stubPrisma({
      entityRelationship: {
        findUnique: jest.fn(async () => ({
          subjectEntityId: 'ent-a',
          objectEntityId: 'ent-b',
        })),
      },
    });
    const out = await resolver(prisma).resolve(
      { target: 'RELATIONSHIP', from: 'param', name: 'id' },
      req({ id: 'rel-1' }),
    );
    const ids = (out ?? []).map((c) => c.scopeId);
    expect(ids).toContain('ent-a');
    expect(ids).toContain('ent-b');
  });

  it('yields nothing when the resource behind the id is gone', async () => {
    const out = await resolver().resolve(
      { target: 'VERIFICATION_CASE', from: 'param', name: 'id' },
      req({ id: 'case-gone' }),
    );
    expect(out).toEqual([]);
  });

  it('reads an identifier out of the body when the route says so', async () => {
    const out = await resolver().resolve(
      { target: 'ORG_UNIT', from: 'body', name: 'parentId' },
      req({}, { parentId: 'u-tech' }),
    );
    expect(units(out)).toEqual(['u-tech', 'u-root']);
  });
});
