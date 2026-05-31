import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEvent, EntityStatus, EntityType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgProfileDto } from './dto/create-org-profile.dto';
import { CreatePersonProfileDto } from './dto/create-person-profile.dto';

@Injectable()
export class EntityProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Person Profile ─────────────────────────────────────────────────────────

  async upsertPersonProfile(entityId: string, dto: CreatePersonProfileDto, userId: string) {
    const entity = await this.findEntityOrThrow(entityId);

    if (entity.entityType !== EntityType.PERSON) {
      throw new BadRequestException(
        `Person profile is only allowed for PERSON entities. This entity is ${entity.entityType}.`,
      );
    }

    const existing = await this.prisma.personProfile.findUnique({ where: { entityId } });
    const isCreate = !existing;

    const profile = await this.prisma.personProfile.upsert({
      where: { entityId },
      create: {
        id: randomUUID(),
        entityId,
        firstName: dto.firstName,
        middleName: dto.middleName ?? null,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        nationality: dto.nationality,
        idType: dto.idType,
        idNumber: dto.idNumber,
        idIssuedBy: dto.idIssuedBy ?? null,
        idIssuedDate: dto.idIssuedDate ? new Date(dto.idIssuedDate) : null,
        idExpiryDate: dto.idExpiryDate ? new Date(dto.idExpiryDate) : null,
        taxNumber: dto.taxNumber ?? null,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city,
        region: dto.region ?? null,
        postalCode: dto.postalCode ?? null,
        addressCountry: dto.addressCountry,
      },
      update: {
        firstName: dto.firstName,
        middleName: dto.middleName ?? null,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        nationality: dto.nationality,
        idType: dto.idType,
        idNumber: dto.idNumber,
        idIssuedBy: dto.idIssuedBy ?? null,
        idIssuedDate: dto.idIssuedDate ? new Date(dto.idIssuedDate) : null,
        idExpiryDate: dto.idExpiryDate ? new Date(dto.idExpiryDate) : null,
        taxNumber: dto.taxNumber ?? null,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city,
        region: dto.region ?? null,
        postalCode: dto.postalCode ?? null,
        addressCountry: dto.addressCountry,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: isCreate ? AuditEvent.PROFILE_CREATED : AuditEvent.PROFILE_UPDATED,
        entityId,
        userId,
        detail: { profileType: 'PERSON' },
      },
    });

    await this.maybeAdvanceStatus(entity, userId);
    return profile;
  }

  async getPersonProfile(entityId: string) {
    await this.findEntityOrThrow(entityId);
    const profile = await this.prisma.personProfile.findUnique({ where: { entityId } });
    if (!profile) throw new NotFoundException(`No person profile found for entity ${entityId}`);
    return profile;
  }

  // ── Organisation Profile ───────────────────────────────────────────────────

  async upsertOrgProfile(entityId: string, dto: CreateOrgProfileDto, userId: string) {
    const entity = await this.findEntityOrThrow(entityId);

    if (entity.entityType !== EntityType.ORGANISATION) {
      throw new BadRequestException(
        `Organisation profile is only allowed for ORGANISATION entities. This entity is ${entity.entityType}.`,
      );
    }

    const existing = await this.prisma.organisationProfile.findUnique({ where: { entityId } });
    const isCreate = !existing;

    const profile = await this.prisma.organisationProfile.upsert({
      where: { entityId },
      create: {
        id: randomUUID(),
        entityId,
        legalName: dto.legalName,
        tradingName: dto.tradingName ?? null,
        registrationNumber: dto.registrationNumber,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
        registrationCountry: dto.registrationCountry,
        businessType: dto.businessType,
        industrySector: dto.industrySector ?? null,
        taxNumber: dto.taxNumber ?? null,
        vatNumber: dto.vatNumber ?? null,
        regAddressLine1: dto.regAddressLine1,
        regAddressLine2: dto.regAddressLine2 ?? null,
        regCity: dto.regCity,
        regRegion: dto.regRegion ?? null,
        regPostalCode: dto.regPostalCode ?? null,
        regCountry: dto.regCountry,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        websiteUrl: dto.websiteUrl ?? null,
      },
      update: {
        legalName: dto.legalName,
        tradingName: dto.tradingName ?? null,
        registrationNumber: dto.registrationNumber,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
        registrationCountry: dto.registrationCountry,
        businessType: dto.businessType,
        industrySector: dto.industrySector ?? null,
        taxNumber: dto.taxNumber ?? null,
        vatNumber: dto.vatNumber ?? null,
        regAddressLine1: dto.regAddressLine1,
        regAddressLine2: dto.regAddressLine2 ?? null,
        regCity: dto.regCity,
        regRegion: dto.regRegion ?? null,
        regPostalCode: dto.regPostalCode ?? null,
        regCountry: dto.regCountry,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        websiteUrl: dto.websiteUrl ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: isCreate ? AuditEvent.PROFILE_CREATED : AuditEvent.PROFILE_UPDATED,
        entityId,
        userId,
        detail: { profileType: 'ORGANISATION' },
      },
    });

    await this.maybeAdvanceStatus(entity, userId);
    return profile;
  }

  async getOrgProfile(entityId: string) {
    await this.findEntityOrThrow(entityId);
    const profile = await this.prisma.organisationProfile.findUnique({ where: { entityId } });
    if (!profile) throw new NotFoundException(`No organisation profile found for entity ${entityId}`);
    return profile;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findEntityOrThrow(id: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException(`Entity ${id} not found`);
    return entity;
  }

  private async maybeAdvanceStatus(
    entity: { id: string; status: EntityStatus },
    userId: string,
  ) {
    if (entity.status !== EntityStatus.DRAFT) return;

    await this.prisma.entity.update({
      where: { id: entity.id },
      data: { status: EntityStatus.PENDING_VERIFICATION },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.ENTITY_STATUS_CHANGED,
        entityId: entity.id,
        userId,
        detail: { from: EntityStatus.DRAFT, to: EntityStatus.PENDING_VERIFICATION },
      },
    });
  }
}
