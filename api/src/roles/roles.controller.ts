import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope } from '../iam/scope.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('v1/roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @ApiOperation({ summary: 'List all roles with their permissions' })
  @ApiOkResponse()
  @RequirePermission('user:read')
  @GlobalScope()
  @Get()
  listRoles() {
    return this.svc.listRoles();
  }

  @ApiOperation({ summary: 'Get a role by ID' })
  @ApiOkResponse()
  @RequirePermission('user:read')
  @GlobalScope()
  @Get(':id')
  getRoleById(@Param('id') id: string) {
    return this.svc.getRoleById(id);
  }
}
