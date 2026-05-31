import { Module } from '@nestjs/common';
import { EvidenceStorageService } from './evidence-storage.service';
import { VerificationCasesController } from './verification-cases.controller';
import { VerificationCasesService } from './verification-cases.service';

@Module({
  controllers: [VerificationCasesController],
  providers: [VerificationCasesService, EvidenceStorageService],
})
export class VerificationCasesModule {}
