import { Module } from '@nestjs/common';
import { EntityRelationshipsByEntityController } from './entity-relationships-by-entity.controller';
import { EntityRelationshipsController } from './entity-relationships.controller';
import { EntityRelationshipsService } from './entity-relationships.service';

@Module({
  controllers: [EntityRelationshipsController, EntityRelationshipsByEntityController],
  providers: [EntityRelationshipsService],
})
export class EntityRelationshipsModule {}
