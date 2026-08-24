import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { OrgUnitQueryDto } from './dto/org-unit-query.dto';
import { SetHeadDto } from './dto/set-head.dto';
import { SetPlacementDto } from './dto/set-placement.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { OrgUnitsService } from './org-units.service';

@ApiTags('org-units')
@ApiBearerAuth()
@Controller('v1')
export class OrgUnitsController {
  constructor(private readonly svc: OrgUnitsService) {}

  @RequirePermission('orgunit:create')
  @ApiOperation({
    summary: 'Create an organisational unit',
    description: 'The structure runs ORGANISATION > DIVISION > DEPARTMENT. Exactly one root per organisation.',
  })
  @ApiCreatedResponse()
  @Post('org-units')
  create(@Body() dto: CreateOrgUnitDto, @Request() req: any) {
    return this.svc.create(dto, req.user?.userId);
  }

  @RequirePermission('orgunit:read')
  @ApiOperation({ summary: 'List organisational units, flat or as a tree' })
  @ApiOkResponse()
  @Get('org-units')
  list(@Query() query: OrgUnitQueryDto) {
    return this.svc.list(query);
  }

  @RequirePermission('orgunit:read')
  @ApiOperation({ summary: 'Get a unit with its head, members, children and ancestry' })
  @ApiOkResponse()
  @Get('org-units/:id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @RequirePermission('orgunit:update')
  @ApiOperation({ summary: 'Rename, re-code or move a unit' })
  @ApiOkResponse()
  @Patch('org-units/:id')
  update(@Param('id') id: string, @Body() dto: UpdateOrgUnitDto, @Request() req: any) {
    return this.svc.update(id, dto, req.user?.userId);
  }

  @RequirePermission('orgunit:update')
  @ApiOperation({
    summary: 'Appoint or clear the head of a unit',
    description: 'The head approves stamp requests from this unit. Send no headUserId to leave the seat vacant.',
  })
  @ApiOkResponse()
  @Patch('org-units/:id/head')
  setHead(@Param('id') id: string, @Body() dto: SetHeadDto, @Request() req: any) {
    return this.svc.setHead(id, dto, req.user?.userId);
  }

  @RequirePermission('orgunit:update')
  @ApiOperation({
    summary: 'Deactivate a unit',
    description: 'Refused while the unit still holds people or live sub-units. Units are never deleted — they are evidence.',
  })
  @ApiOkResponse()
  @Patch('org-units/:id/deactivate')
  deactivate(@Param('id') id: string, @Request() req: any) {
    return this.svc.deactivate(id, req.user?.userId);
  }

  // ── People on the chart ────────────────────────────────────────────────────

  @RequirePermission('user:update')
  @ApiOperation({
    summary: 'Place a person on the org chart',
    description: 'Sets the unit they work in, their line manager, and the verified PERSON entity behind their login.',
  })
  @ApiOkResponse()
  @Patch('users/:id/placement')
  setPlacement(@Param('id') id: string, @Body() dto: SetPlacementDto, @Request() req: any) {
    return this.svc.setPlacement(id, dto, req.user?.userId);
  }

  @RequirePermission('orgunit:read')
  @ApiOperation({
    summary: 'Who signs off for this person',
    description: 'Their line manager reviews and their unit head approves. Reports any blocker — no unit, vacant head, reviewer and approver being the same person — before a stamp request is raised.',
  })
  @ApiOkResponse()
  @Get('users/:id/approval-chain')
  approvalChain(@Param('id') id: string) {
    return this.svc.approvalChain(id);
  }
}
