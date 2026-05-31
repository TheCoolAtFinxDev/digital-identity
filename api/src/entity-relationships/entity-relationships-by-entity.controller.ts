import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { EntityRelationshipsQueryDto } from './dto/relationship-query.dto';
import { EntityRelationshipsService } from './entity-relationships.service';

@ApiTags('entity-relationships')
@ApiBearerAuth()
@Controller('v1/entities')
export class EntityRelationshipsByEntityController {
  constructor(private readonly svc: EntityRelationshipsService) {}

  @RequirePermission('relationship:read')
  @ApiOperation({ summary: 'List relationships where entity is subject or object' })
  @ApiOkResponse()
  @Get(':id/relationships')
  listByEntity(
    @Param('id') id: string,
    @Query() query: EntityRelationshipsQueryDto,
  ) {
    return this.svc.listByEntity(id, query);
  }
}
