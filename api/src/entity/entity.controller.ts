import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EntityService } from './entity.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateKycStatusDto } from './dto/update-kyc-status.dto';
import { EntityPageDto, EntityQueryDto, EntityResponseDto } from './dto/entity-response.dto';
import { RequirePermission } from '../iam/permission.decorator';

@ApiBearerAuth()
@ApiTags('entities')
@Controller('v1/entities')
export class EntityController {
  constructor(private readonly svc: EntityService) {}

  @ApiOperation({ summary: 'List registered entities (paginated)' })
  @ApiOkResponse({ type: EntityPageDto })
  @RequirePermission('entity:read')
  @Get()
  listEntities(@Query() q: EntityQueryDto) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));
    return this.svc.listEntities(page, limit, q.kycStatus);
  }

  @ApiOperation({ summary: 'Register a new legal entity' })
  @ApiCreatedResponse({ type: EntityResponseDto })
  @RequirePermission('entity:create')
  @Post()
  createEntity(@Body() dto: CreateEntityDto, @Request() req: any) {
    return this.svc.createEntity(dto, req.user?.userId);
  }

  @ApiOperation({ summary: 'Get a registered entity by ID' })
  @ApiOkResponse({ type: EntityResponseDto })
  @RequirePermission('entity:read')
  @Get(':id')
  getEntity(@Param('id') id: string) {
    return this.svc.getEntity(id);
  }

  @ApiOperation({ summary: 'Update the KYC status of an entity' })
  @ApiOkResponse({ type: EntityResponseDto })
  @RequirePermission('entity:approve')
  @Patch(':id/kyc-status')
  updateKycStatus(@Param('id') id: string, @Body() dto: UpdateKycStatusDto, @Request() req: any) {
    return this.svc.updateKycStatus(id, dto, req.user?.userId);
  }
}
