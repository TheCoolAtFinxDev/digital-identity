import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { AssignSaRoleDto } from './dto/assign-sa-role.dto';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';
import { ServiceAccountsService } from './service-accounts.service';

@ApiTags('service-accounts')
@ApiBearerAuth()
@Controller('v1/service-accounts')
export class ServiceAccountsController {
  constructor(private readonly svc: ServiceAccountsService) {}

  @RequirePermission('serviceaccount:create')
  @ApiOperation({ summary: 'Create a service account (returns clientSecret ONCE)' })
  @ApiCreatedResponse()
  @Post()
  create(@Body() dto: CreateServiceAccountDto, @Request() req: any) {
    return this.svc.create(dto, req.user?.userId);
  }

  @RequirePermission('serviceaccount:read')
  @ApiOperation({ summary: 'List service accounts' })
  @ApiOkResponse()
  @Get()
  list() {
    return this.svc.list();
  }

  @RequirePermission('serviceaccount:read')
  @ApiOperation({ summary: 'Get a service account' })
  @ApiOkResponse()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @RequirePermission('serviceaccount:create')
  @ApiOperation({ summary: 'Deactivate a service account' })
  @HttpCode(200)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Request() req: any) {
    return this.svc.deactivate(id, req.user?.userId);
  }

  @RequirePermission('serviceaccount:create')
  @ApiOperation({ summary: 'Rotate the client secret (returns new secret ONCE)' })
  @HttpCode(200)
  @Post(':id/rotate-secret')
  rotate(@Param('id') id: string) {
    return this.svc.rotateSecret(id);
  }

  @RequirePermission('serviceaccount:create')
  @ApiOperation({ summary: 'Assign a role to a service account' })
  @ApiCreatedResponse()
  @Post(':id/roles')
  assignRole(@Param('id') id: string, @Body() dto: AssignSaRoleDto, @Request() req: any) {
    return this.svc.assignRole(id, dto, req.user?.userId);
  }

  @RequirePermission('serviceaccount:read')
  @ApiOperation({ summary: 'List a service account\'s active role assignments' })
  @ApiOkResponse()
  @Get(':id/roles')
  getRoles(@Param('id') id: string) {
    return this.svc.getRoles(id);
  }

  @RequirePermission('serviceaccount:create')
  @ApiOperation({ summary: 'Revoke a role assignment' })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Delete(':id/roles/:assignmentId')
  async revokeRole(@Param('id') id: string, @Param('assignmentId') assignmentId: string, @Request() req: any) {
    await this.svc.revokeRole(id, assignmentId, req.user?.userId);
  }
}
