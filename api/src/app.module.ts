import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { CertificateModule } from './certificate/certificate.module';
import { EntityModule } from './entity/entity.module';
import { EntityProfilesModule } from './entity-profiles/entity-profiles.module';
import { EntityRelationshipsModule } from './entity-relationships/entity-relationships.module';
import { IamModule } from './iam/iam.module';
import { VerificationCasesModule } from './verification-cases/verification-cases.module';
import { PermissionGuard } from './iam/permission.guard';
import { DocumentsModule } from './documents/documents.module';
import { StampRequestsModule } from './stamp-requests/stamp-requests.module';
import { ObjectModule } from './object/object.module';
import { OrgUnitsModule } from './org-units/org-units.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { ServiceAccountsModule } from './service-accounts/service-accounts.module';
import { SigningModule } from './signing/signing.module';
import { StampingModule } from './stamping/stamping.module';
import { TrustModule } from './trust/trust.module';
import { UsersModule } from './users/users.module';
import { VerificationModule } from './verification/verification.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    DocumentsModule,
    StampRequestsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    IamModule,
    BootstrapModule,
    AuthModule,
    CertificateModule,
    EntityModule,
    EntityProfilesModule,
    EntityRelationshipsModule,
    VerificationCasesModule,
    ObjectModule,
    OrgUnitsModule,
    VerificationModule,
    AuditModule,
    UsersModule,
    RolesModule,
    ServiceAccountsModule,
    SigningModule,
    StampingModule,
    TrustModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard execution order: throttle → JWT auth → permission check
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
