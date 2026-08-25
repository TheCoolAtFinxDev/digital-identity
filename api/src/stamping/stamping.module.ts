import { Module } from '@nestjs/common';
import { SigningModule } from '../signing/signing.module';
import { DocumentVerificationController } from './document-verification.controller';
import { DocumentVerificationService } from './document-verification.service';
import { PdfStampService } from './pdf-stamp.service';
import { StampStorageService } from './stamp-storage.service';
import { StampingController } from './stamping.controller';
import { StampingService } from './stamping.service';

@Module({
  imports: [SigningModule],
  controllers: [StampingController, DocumentVerificationController],
  providers: [StampingService, DocumentVerificationService, PdfStampService, StampStorageService],
  exports: [PdfStampService, StampStorageService],
})
export class StampingModule {}
