import { Module } from '@nestjs/common';
import { OrgUnitsModule } from '../org-units/org-units.module';
import { SigningModule } from '../signing/signing.module';
import { StampingModule } from '../stamping/stamping.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [SigningModule, StampingModule, OrgUnitsModule],
  controllers: [DocumentsController, MeController],
  providers: [DocumentsService, MeService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
