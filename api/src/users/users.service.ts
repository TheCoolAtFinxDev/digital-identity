import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEvent, Prisma, RoleScope } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';

const BCRYPT_ROUNDS = 12;

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  isActive: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto, createdByUserId: string) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          username: dto.username,
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
          isActive: true,
          createdBy: createdByUserId,
        },
        select: USER_SELECT,
      });

      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.USER_CREATED,
          userId: createdByUserId,
          detail: { newUserId: user.id, username: user.username },
        },
      });

      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username or email is already taken');
      }
      throw e;
    }
  }

  async listUsers(query: UserListQueryDto) {
    const where: Prisma.UserWhereInput = query.activeOnly ? { isActive: true } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.getUserById(id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { email: dto.email, displayName: dto.displayName },
        select: USER_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email is already taken');
      }
      throw e;
    }
  }

  async deactivateUser(id: string, requestorUserId: string) {
    const user = await this.getUserById(id);
    if (!user.isActive) return user;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.USER_DEACTIVATED,
        userId: requestorUserId,
        detail: { targetUserId: id, username: user.username },
      },
    });

    return updated;
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    await this.getUserById(id);
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async assignRole(userId: string, dto: AssignRoleDto, assignedByUserId: string) {
    await this.getUserById(userId);

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);

    const scope = dto.scope ?? RoleScope.GLOBAL;

    try {
      const assignment = await this.prisma.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId,
          roleId: dto.roleId,
          scope,
          scopeId: dto.scopeId ?? null,
          assignedBy: assignedByUserId,
          isActive: true,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        include: {
          role: { select: { id: true, code: true, name: true } },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.ROLE_ASSIGNED,
          userId: assignedByUserId,
          detail: {
            targetUserId: userId,
            roleCode: role.code,
            scope,
            scopeId: dto.scopeId ?? null,
          },
        },
      });

      return assignment;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `User already has role ${role.code} with ${scope} scope`,
        );
      }
      throw e;
    }
  }

  async getUserRoles(userId: string) {
    await this.getUserById(userId);
    return this.prisma.userRoleAssignment.findMany({
      where: { userId, isActive: true },
      include: {
        role: { select: { id: true, code: true, name: true, description: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async revokeRole(userId: string, assignmentId: string, revokedByUserId: string) {
    const assignment = await this.prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId },
      include: { role: { select: { code: true } } },
    });

    if (!assignment) {
      throw new NotFoundException(`Role assignment ${assignmentId} not found for user ${userId}`);
    }

    if (!assignment.isActive) return;

    await this.prisma.userRoleAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.ROLE_REVOKED,
        userId: revokedByUserId,
        detail: {
          targetUserId: userId,
          roleCode: assignment.role.code,
          assignmentId,
        },
      },
    });
  }
}
