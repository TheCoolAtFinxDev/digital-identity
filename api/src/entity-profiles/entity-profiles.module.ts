import { Module } from '@nestjs/common';
import { EntityProfilesController } from './entity-profiles.controller';
import { EntityProfilesService } from './entity-profiles.service';

@Module({
  controllers: [EntityProfilesController],
  providers: [EntityProfilesService],
})
export class EntityProfilesModule {}
