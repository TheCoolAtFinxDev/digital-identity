import { Module } from '@nestjs/common';
import { OrgUnitsModule } from '../org-units/org-units.module';
import { SigningModule } from '../signing/signing.module';
import { StampingModule } from '../stamping/stamping.module';
import { StampRequestsController } from './stamp-requests.controller';
import { StampRequestsService } from './stamp-requests.service';

@Module({
  imports: [SigningModule, StampingModule, OrgUnitsModule],
  controllers: [StampRequestsController],
  providers: [StampRequestsService],
})
export class StampRequestsModule {}
