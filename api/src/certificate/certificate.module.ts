import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateLifecycleService } from './certificate-lifecycle.service';
import { CertificateService } from './certificate.service';
import { PolicyService } from '../policy/policy.service';

@Module({
  controllers: [CertificateController],
  providers: [CertificateService, CertificateLifecycleService, PolicyService],
  exports: [CertificateService],
})
export class CertificateModule {}
