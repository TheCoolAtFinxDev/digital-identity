import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope, ScopedTo } from '../iam/scope.decorator';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { RelationshipQueryDto } from './dto/relationship-query.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import { EntityRelationshipsService } from './entity-relationships.service';

@ApiTags('entity-relationships')
@ApiBearerAuth()
@Controller('v1/entity-relationships')
export class EntityRelationshipsController {
  constructor(private readonly svc: EntityRelationshipsService) {}

  @RequirePermission('relationship:create')
  @ScopedTo({ target: 'ENTITY', from: 'body', name: 'subjectEntityId' })
  @ApiOperation({ summary: 'Create a new entity relationship' })
  @ApiCreatedResponse()
  @Post()
  createRelationship(@Body() dto: CreateRelationshipDto, @Request() req: any) {
    return this.svc.createRelationship(dto, req.user.userId);
  }

  @RequirePermission('relationship:read')
  @GlobalScope()
  @ApiOperation({ summary: 'List entity relationships (paginated)' })
  @ApiOkResponse()
  @Get()
  listRelationships(@Query() query: RelationshipQueryDto) {
    return this.svc.listRelationships(query);
  }

  @RequirePermission('relationship:read')
  @ScopedTo({ target: 'RELATIONSHIP', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Get a relationship by ID' })
  @ApiOkResponse()
  @Get(':id')
  getRelationshipById(@Param('id') id: string) {
    return this.svc.getRelationshipById(id);
  }

  @RequirePermission('relationship:update')
  @ScopedTo({ target: 'RELATIONSHIP', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Update mutable fields of a relationship' })
  @ApiOkResponse()
  @Patch(':id')
  updateRelationship(@Param('id') id: string, @Body() dto: UpdateRelationshipDto, @Request() req: any) {
    return this.svc.updateRelationship(id, dto, req.user.userId);
  }

  @RequirePermission('relationship:deactivate')
  @ScopedTo({ target: 'RELATIONSHIP', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Deactivate a relationship' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/deactivate')
  deactivateRelationship(@Param('id') id: string, @Request() req: any) {
    return this.svc.deactivateRelationship(id, req.user.userId);
  }
}
