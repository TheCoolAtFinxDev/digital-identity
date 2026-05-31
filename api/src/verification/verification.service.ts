import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(serial: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { serial },
      include: {
        request: {
          include: { entity: true },
        },
      },
    });

    if (!cert) {
      throw new NotFoundException(`Certificate with serial ${serial} not found`);
    }

    const now = new Date();
    const isExpired = now > cert.validTo;
    const valid = !isExpired && !cert.isRevoked;

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.VERIFICATION_PERFORMED,
        detail: { serial, valid, isExpired, isRevoked: cert.isRevoked },
      },
    });

    const entity = cert.request.entity
      ? {
          id: cert.request.entity.id,
          name: cert.request.entity.name,
          country: cert.request.entity.country,
          kycStatus: cert.request.entity.kycStatus,
        }
      : null;

    return {
      valid,
      serial: cert.serial,
      subject: cert.subject,
      issuer: cert.issuer,
      profile: cert.profile,
      identityType: cert.profile === 'usr_entity_cert' ? 'ENTITY' : 'OBJECT',
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      isExpired,
      isRevoked: cert.isRevoked,
      entity,
      checkedAt: now,
    };
  }
}
