import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditEvent, EntityType, OrgUnitType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { OrgUnitQueryDto } from './dto/org-unit-query.dto';
import { SetHeadDto } from './dto/set-head.dto';
import { SetPlacementDto } from './dto/set-placement.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

/** Higher rank contains lower rank. A parent must always outrank its child. */
const RANK: Record<OrgUnitType, number> = {
  ORGANISATION: 3,
  DIVISION: 2,
  DEPARTMENT: 1,
};

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Structure ──────────────────────────────────────────────────────────────

  async create(dto: CreateOrgUnitDto, userId?: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException(`Entity ${dto.entityId} not found`);
    if (entity.entityType !== EntityType.ORGANISATION) {
      throw new UnprocessableEntityException(
        'Only an ORGANISATION entity has an internal structure. A person does not have departments.',
      );
    }

    const unitType = dto.unitType as OrgUnitType;

    if (unitType === OrgUnitType.ORGANISATION) {
      if (dto.parentId) {
        throw new BadRequestException('The root unit cannot have a parent');
      }
      const existingRoot = await this.prisma.orgUnit.findFirst({
        where: { entityId: dto.entityId, unitType: OrgUnitType.ORGANISATION, isActive: true },
      });
      if (existingRoot) {
        throw new ConflictException(
          `${entity.name} already has a root unit (${existingRoot.name}). Add divisions or departments under it.`,
        );
      }
    } else {
      if (!dto.parentId) {
        throw new BadRequestException(`A ${unitType} must sit under a parent unit`);
      }
      const parent = await this.requireUnit(dto.parentId);
      if (parent.entityId !== dto.entityId) {
        throw new BadRequestException('The parent unit belongs to a different organisation');
      }
      if (!parent.isActive) {
        throw new UnprocessableEntityException('Cannot add a unit under a deactivated parent');
      }
      this.assertRank(parent.unitType, unitType);
    }

    if (dto.headUserId) await this.requireAppointableUser(dto.headUserId);

    const unit = await this.prisma.orgUnit.create({
      data: {
        entityId: dto.entityId,
        unitType,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        parentId: dto.parentId ?? null,
        headUserId: dto.headUserId ?? null,
        createdBy: userId ?? null,
      },
    });

    await this.audit(AuditEvent.ORG_UNIT_CREATED, unit.entityId, userId, {
      orgUnitId: unit.id,
      unitType,
      name: unit.name,
      parentId: unit.parentId,
      headUserId: unit.headUserId,
    });

    return this.toResponse(unit);
  }

  async list(query: OrgUnitQueryDto) {
    const where: Prisma.OrgUnitWhereInput = {};
    if (query.entityId) where.entityId = query.entityId;
    if (query.unitType) where.unitType = query.unitType as OrgUnitType;
    if (!query.includeInactive) where.isActive = true;

    const units = await this.prisma.orgUnit.findMany({
      where,
      orderBy: [{ unitType: 'asc' }, { name: 'asc' }],
      include: {
        head: { select: { id: true, username: true, displayName: true, isActive: true } },
        _count: { select: { members: true, children: true } },
      },
    });

    const rows = units.map((u) => this.toResponse(u));
    return query.tree ? { data: this.nest(rows) } : { data: rows, total: rows.length };
  }

  async get(id: string) {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, username: true, displayName: true, isActive: true } },
        parent: { select: { id: true, name: true, unitType: true } },
        children: {
          where: { isActive: true },
          select: { id: true, name: true, unitType: true },
          orderBy: { name: 'asc' },
        },
        members: {
          where: { isActive: true },
          select: { id: true, username: true, displayName: true, managerId: true },
          orderBy: { username: 'asc' },
        },
        _count: { select: { members: true, children: true } },
      },
    });
    if (!unit) throw new NotFoundException(`Org unit ${id} not found`);

    return {
      ...this.toResponse(unit),
      parent: unit.parent,
      children: unit.children,
      members: unit.members,
      // The chain matters for approval routing and for what a stamp says.
      ancestry: await this.ancestry(unit.id),
    };
  }

  async update(id: string, dto: UpdateOrgUnitDto, userId?: string) {
    const unit = await this.requireUnit(id);

    if (dto.parentId !== undefined && dto.parentId !== unit.parentId) {
      if (unit.unitType === OrgUnitType.ORGANISATION) {
        throw new BadRequestException('The root unit cannot be moved under a parent');
      }
      const parent = await this.requireUnit(dto.parentId);
      if (parent.entityId !== unit.entityId) {
        throw new BadRequestException('Cannot move a unit into a different organisation');
      }
      this.assertRank(parent.unitType, unit.unitType);
      // Moving a unit under its own descendant would detach that whole branch
      // from the root and leave a cycle no approval walk could terminate on.
      const parentAncestry = await this.ancestry(parent.id);
      if (parent.id === id || parentAncestry.some((a) => a.id === id)) {
        throw new BadRequestException('Cannot move a unit under itself or one of its own descendants');
      }
    }

    const updated = await this.prisma.orgUnit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });

    await this.audit(AuditEvent.ORG_UNIT_UPDATED, updated.entityId, userId, {
      orgUnitId: id,
      changed: Object.keys(dto),
      parentId: updated.parentId,
    });

    return this.toResponse(updated);
  }

  async setHead(id: string, dto: SetHeadDto, userId?: string) {
    const unit = await this.requireUnit(id);
    const headUserId = dto.headUserId ?? null;
    if (headUserId) await this.requireAppointableUser(headUserId);

    const updated = await this.prisma.orgUnit.update({
      where: { id },
      data: { headUserId },
    });

    await this.audit(AuditEvent.ORG_UNIT_HEAD_CHANGED, unit.entityId, userId, {
      orgUnitId: id,
      previousHeadUserId: unit.headUserId,
      headUserId,
    });

    return this.toResponse(updated);
  }

  /**
   * Deactivate rather than delete: a unit that has stamped anything is evidence.
   * Refuses while the unit still holds people or live sub-units — those must be
   * moved first, so nobody is silently orphaned mid-approval.
   */
  async deactivate(id: string, userId?: string) {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id },
      include: { _count: { select: { children: true, members: true } } },
    });
    if (!unit) throw new NotFoundException(`Org unit ${id} not found`);
    if (!unit.isActive) throw new UnprocessableEntityException('Unit is already deactivated');

    const activeChildren = await this.prisma.orgUnit.count({ where: { parentId: id, isActive: true } });
    const activeMembers = await this.prisma.user.count({ where: { orgUnitId: id, isActive: true } });
    if (activeChildren > 0 || activeMembers > 0) {
      throw new UnprocessableEntityException(
        `Cannot deactivate ${unit.name}: it still holds ${activeMembers} member(s) and ${activeChildren} sub-unit(s). Move them first.`,
      );
    }

    const updated = await this.prisma.orgUnit.update({ where: { id }, data: { isActive: false } });
    await this.audit(AuditEvent.ORG_UNIT_DEACTIVATED, unit.entityId, userId, {
      orgUnitId: id,
      name: unit.name,
    });
    return this.toResponse(updated);
  }

  // ─── People ─────────────────────────────────────────────────────────────────

  /** Place a person on the chart: their unit, their manager, their verified identity. */
  async setPlacement(targetUserId: string, dto: SetPlacementDto, userId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);

    if (dto.orgUnitId) {
      const unit = await this.requireUnit(dto.orgUnitId);
      if (!unit.isActive) throw new UnprocessableEntityException('Cannot place someone in a deactivated unit');
    }

    if (dto.managerId) {
      if (dto.managerId === targetUserId) {
        throw new BadRequestException('Nobody can be their own manager');
      }
      const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
      if (!manager) throw new NotFoundException(`Manager ${dto.managerId} not found`);
      if (!manager.isActive) throw new UnprocessableEntityException('Cannot report to a deactivated user');
      // A reporting cycle would let a stamp request find its own requester as
      // reviewer, satisfying four-eyes on paper.
      if (await this.reportsTo(dto.managerId, targetUserId)) {
        throw new BadRequestException(
          'That would create a reporting loop — the proposed manager already reports to this person',
        );
      }
    }

    if (dto.personEntityId) {
      const entity = await this.prisma.entity.findUnique({ where: { id: dto.personEntityId } });
      if (!entity) throw new NotFoundException(`Entity ${dto.personEntityId} not found`);
      if (entity.entityType !== EntityType.PERSON) {
        throw new UnprocessableEntityException(
          'A login can only be linked to a PERSON entity — that link is what makes a signature attributable to a named individual',
        );
      }
      const taken = await this.prisma.user.findFirst({
        where: { personEntityId: dto.personEntityId, NOT: { id: targetUserId } },
        select: { username: true },
      });
      if (taken) {
        throw new ConflictException(`That identity is already linked to the login "${taken.username}"`);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.personEntityId !== undefined ? { personEntityId: dto.personEntityId } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        orgUnitId: true,
        managerId: true,
        personEntityId: true,
      },
    });

    await this.audit(AuditEvent.USER_PLACEMENT_CHANGED, null, userId, {
      targetUserId,
      orgUnitId: updated.orgUnitId,
      managerId: updated.managerId,
      personEntityId: updated.personEntityId,
    });

    return updated;
  }

  /**
   * Who signs off on this person's stamp request: their line manager reviews,
   * the head of their unit approves. Exposed because the approval workflow and
   * the portal both need to show it before a request is raised.
   */
  async approvalChain(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        manager: { select: { id: true, username: true, displayName: true, isActive: true } },
        orgUnit: {
          include: { head: { select: { id: true, username: true, displayName: true, isActive: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);

    const unit = user.orgUnit;
    const head = unit?.head ?? null;

    // A deactivated head is a vacant seat, not an approver. In practice people
    // are deactivated rather than deleted, so this — not the foreign key — is
    // what surfaces a vacancy.
    const headAvailable = Boolean(head?.isActive);
    const managerAvailable = Boolean(user.manager?.isActive);

    const blockers: string[] = [];
    if (!unit) blockers.push('The person is not assigned to any unit');
    if (!managerAvailable) blockers.push('No active line manager to review');
    if (!headAvailable) blockers.push('The unit has no active head to approve');
    if (user.manager && head && user.manager.id === head.id) {
      blockers.push('The line manager and the unit head are the same person — four eyes cannot be satisfied');
    }
    if (head && head.id === targetUserId) {
      blockers.push('The requester heads this unit and cannot approve their own request');
    }

    return {
      userId: targetUserId,
      unit: unit ? { id: unit.id, name: unit.name, unitType: unit.unitType, code: unit.code } : null,
      reviewer: managerAvailable ? user.manager : null,
      approver: headAvailable ? head : null,
      canRequestStamp: blockers.length === 0,
      blockers,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async requireUnit(id: string) {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException(`Org unit ${id} not found`);
    return unit;
  }

  private async requireAppointableUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (!user.isActive) throw new UnprocessableEntityException('Cannot appoint a deactivated user as head');
    return user;
  }

  private assertRank(parentType: OrgUnitType, childType: OrgUnitType) {
    if (RANK[parentType] <= RANK[childType]) {
      throw new BadRequestException(
        `A ${childType} cannot sit under a ${parentType}. The structure runs ORGANISATION > DIVISION > DEPARTMENT.`,
      );
    }
  }

  /** Walk from a unit up to the root. Bounded so a corrupt parent link cannot hang the request. */
  private async ancestry(id: string) {
    const chain: Array<{ id: string; name: string; unitType: OrgUnitType }> = [];
    let cursor = await this.prisma.orgUnit.findUnique({
      where: { id },
      select: { parentId: true },
    });
    const seen = new Set<string>([id]);

    while (cursor?.parentId && !seen.has(cursor.parentId)) {
      seen.add(cursor.parentId);
      const parent = await this.prisma.orgUnit.findUnique({
        where: { id: cursor.parentId },
        select: { id: true, name: true, unitType: true, parentId: true },
      });
      if (!parent) break;
      chain.push({ id: parent.id, name: parent.name, unitType: parent.unitType });
      cursor = { parentId: parent.parentId };
      if (chain.length > 32) break;
    }
    return chain;
  }

  /** True when `candidateId` already sits somewhere below `userId` in the reporting line. */
  private async reportsTo(candidateId: string, userId: string): Promise<boolean> {
    let cursor: string | null = candidateId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const row: { managerId: string | null } | null = await this.prisma.user.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      if (!row?.managerId) return false;
      if (row.managerId === userId) return true;
      cursor = row.managerId;
    }
    return false;
  }

  private nest(rows: ReturnType<OrgUnitsService['toResponse']>[]) {
    const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as typeof rows }]));
    const roots: Array<(typeof rows)[number] & { children: typeof rows }> = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private toResponse(unit: {
    id: string;
    entityId: string;
    unitType: OrgUnitType;
    name: string;
    code: string | null;
    parentId: string | null;
    headUserId: string | null;
    isActive: boolean;
    createdAt: Date;
    head?: { id: string; username: string; displayName: string | null; isActive: boolean } | null;
    _count?: { members: number; children: number };
  }) {
    return {
      id: unit.id,
      entityId: unit.entityId,
      unitType: unit.unitType,
      name: unit.name,
      code: unit.code,
      parentId: unit.parentId,
      headUserId: unit.headUserId,
      head: unit.head ?? null,
      // A head who has been deactivated leaves the seat effectively empty.
      headVacant: !unit.headUserId || unit.head?.isActive === false,
      memberCount: unit._count?.members,
      childCount: unit._count?.children,
      isActive: unit.isActive,
      createdAt: unit.createdAt,
    };
  }

  private async audit(
    event: AuditEvent,
    entityId: string | null,
    userId: string | undefined,
    detail: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { event, entityId, userId: userId ?? null, detail: detail as Prisma.InputJsonValue },
    });
  }
}
