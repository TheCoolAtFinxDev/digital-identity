import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { CreateOrgProfileDto } from './dto/create-org-profile.dto';
import { CreatePersonProfileDto } from './dto/create-person-profile.dto';
import { EntityProfilesService } from './entity-profiles.service';

@ApiTags('entities')
@ApiBearerAuth()
@Controller('v1/entities')
export class EntityProfilesController {
  constructor(private readonly svc: EntityProfilesService) {}

  @RequirePermission('entity:update')
  @ApiOperation({ summary: 'Create or update a person profile for a PERSON entity' })
  @ApiCreatedResponse()
  @Post(':id/person-profile')
  upsertPersonProfile(
    @Param('id') id: string,
    @Body() dto: CreatePersonProfileDto,
    @Request() req: any,
  ) {
    return this.svc.upsertPersonProfile(id, dto, req.user.userId);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'Get the person profile for a PERSON entity' })
  @ApiOkResponse()
  @Get(':id/person-profile')
  getPersonProfile(@Param('id') id: string) {
    return this.svc.getPersonProfile(id);
  }

  @RequirePermission('entity:update')
  @ApiOperation({ summary: 'Create or update an organisation profile for an ORGANISATION entity' })
  @ApiCreatedResponse()
  @Post(':id/org-profile')
  upsertOrgProfile(
    @Param('id') id: string,
    @Body() dto: CreateOrgProfileDto,
    @Request() req: any,
  ) {
    return this.svc.upsertOrgProfile(id, dto, req.user.userId);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'Get the organisation profile for an ORGANISATION entity' })
  @ApiOkResponse()
  @Get(':id/org-profile')
  getOrgProfile(@Param('id') id: string) {
    return this.svc.getOrgProfile(id);
  }
}
