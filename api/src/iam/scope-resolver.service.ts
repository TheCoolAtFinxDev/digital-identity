import { Injectable } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeDeclaration } from './scope.decorator';

/** One (scope, scopeId) pair a role assignment could carry to satisfy a request. */
export interface ScopeCandidate {
  type: RoleScope;
  scopeId: string;
}

/**
 * Turns "this route acts on org unit X" into "these role assignments would
 * authorise it".
 *
 * Two rules decide the candidate set:
 *
 *  - Authority flows DOWN the org chart. A role granted on Technology division
 *    authorises acting on the Finance department beneath it, because the head of
 *    a division is in the reporting line of everyone under it. It never flows up:
 *    a role on Finance says nothing about Technology.
 *  - A unit belongs to the verified ORGANISATION entity it hangs off, so an
 *    ORGANISATION-scoped grant on that entity covers every unit in the chart.
 *
 * GLOBAL assignments are added by IamService for every request and are not
 * returned here.
 */
@Injectable()
export class ScopeResolverService {
  /** Depth limit for the ancestor walk. The service rejects cycles on write, so
   *  this only ever bounds a chart corrupted by direct database editing. */
  private static readonly MAX_DEPTH = 16;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a route's scope declaration against the live request.
   *
   * Three outcomes, and the difference between the last two is the whole safety
   * argument:
   *
   *   candidates — grants that would authorise this request
   *   []         — the request named a target that cannot be found, so no narrow
   *                grant can cover it. Fail closed; whoever holds the permission
   *                organisation-wide still gets through to the handler's own 404.
   *   null       — the request does not populate this declaration's field at all,
   *                so the declaration describes nothing here. A rename carries no
   *                destination, and there is no destination to authorise.
   */
  async resolve(declaration: ScopeDeclaration, req: any): Promise<ScopeCandidate[] | null> {
    if (declaration.target === 'GLOBAL') return [];

    const id = this.readIdentifier(declaration, req);
    if (!id) return null;

    switch (declaration.target) {
      case 'ORG_UNIT':
        return this.forOrgUnit(id);

      case 'ENTITY':
        return this.forEntity(id);

      case 'USER':
        return this.forUser(id);

      case 'VERIFICATION_CASE': {
        const c = await this.prisma.verificationCase.findUnique({
          where: { id },
          select: { entityId: true },
        });
        return c ? this.forEntity(c.entityId) : [];
      }

      case 'CERT_REQUEST': {
        const r = await this.prisma.certificateRequest.findUnique({
          where: { id },
          select: { entityId: true },
        });
        return r?.entityId ? this.forEntity(r.entityId) : [];
      }

      case 'CERTIFICATE': {
        // Addressed by serial; the entity hangs off the request behind it.
        const cert = await this.prisma.certificate.findUnique({
          where: { serial: id },
          select: { request: { select: { entityId: true } } },
        });
        return cert?.request?.entityId ? this.forEntity(cert.request.entityId) : [];
      }

      case 'RELATIONSHIP': {
        // Both ends count: a grant over either party authorises acting on the
        // relationship between them.
        const rel = await this.prisma.entityRelationship.findUnique({
          where: { id },
          select: { subjectEntityId: true, objectEntityId: true },
        });
        if (!rel) return [];
        return [
          ...(await this.forEntity(rel.subjectEntityId)),
          ...(await this.forEntity(rel.objectEntityId)),
        ];
      }

      case 'STAMP': {
        // A stamp is released either by a legal entity or by an organisational
        // unit, so it resolves through whichever holder it actually has.
        const doc = await this.prisma.stampedDocument.findUnique({
          where: { id },
          select: { entityId: true, orgUnitId: true },
        });
        if (!doc) return [];
        if (doc.orgUnitId) return this.forOrgUnit(doc.orgUnitId);
        return doc.entityId ? this.forEntity(doc.entityId) : [];
      }

      default:
        return [];
    }
  }

  /** The unit itself, every unit above it, and the organisation entity it belongs to. */
  private async forOrgUnit(orgUnitId: string): Promise<ScopeCandidate[]> {
    const candidates: ScopeCandidate[] = [];
    const seen = new Set<string>();

    let currentId: string | null = orgUnitId;
    let entityId: string | null = null;

    for (let depth = 0; currentId && depth < ScopeResolverService.MAX_DEPTH; depth++) {
      if (seen.has(currentId)) break;
      seen.add(currentId);

      const unit: { id: string; parentId: string | null; entityId: string } | null =
        await this.prisma.orgUnit.findUnique({
          where: { id: currentId },
          select: { id: true, parentId: true, entityId: true },
        });
      if (!unit) break;

      candidates.push({ type: RoleScope.ORG_UNIT, scopeId: unit.id });
      entityId = unit.entityId;
      currentId = unit.parentId;
    }

    // Nothing resolved at all — the unit does not exist. Fail closed.
    if (!candidates.length) return [];

    if (entityId) {
      candidates.push({ type: RoleScope.ORGANISATION, scopeId: entityId });
      candidates.push({ type: RoleScope.ENTITY, scopeId: entityId });
    }
    return candidates;
  }

  /**
   * An entity is its own scope. ORGANISATION and ENTITY are both offered because
   * the two have been used interchangeably for organisation entities since before
   * the org chart existed — CertificateService still resolves cert:issue that way.
   */
  private forEntity(entityId: string): ScopeCandidate[] {
    return [
      { type: RoleScope.ENTITY, scopeId: entityId },
      { type: RoleScope.ORGANISATION, scopeId: entityId },
    ];
  }

  /** A user is reachable through the unit they work in and the person they are. */
  private async forUser(userId: string): Promise<ScopeCandidate[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { orgUnitId: true, personEntityId: true },
    });
    if (!user) return [];

    const candidates: ScopeCandidate[] = [];
    if (user.orgUnitId) candidates.push(...(await this.forOrgUnit(user.orgUnitId)));
    if (user.personEntityId) candidates.push(...this.forEntity(user.personEntityId));
    return candidates;
  }

  private readIdentifier(declaration: ScopeDeclaration, req: any): string | null {
    if (declaration.target === 'GLOBAL') return null;
    const bag = declaration.from === 'body' ? req.body : req.params;
    const value = bag?.[declaration.name];
    return typeof value === 'string' && value.length ? value : null;
  }
}
