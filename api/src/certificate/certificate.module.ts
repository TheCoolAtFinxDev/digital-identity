import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { PolicyService } from '../policy/policy.service';

@Module({
  controllers: [CertificateController],
  providers: [CertificateService, PolicyService],
})
export class CertificateModule {}
