import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RequirePermission } from '../iam/permission.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('v1/permissions')
export class PermissionsController {
  constructor(private readonly svc: RolesService) {}

  @ApiOperation({ summary: 'List all permission codes' })
  @ApiOkResponse()
  @RequirePermission('user:read')
  @Get()
  listPermissions() {
    return this.svc.listPermissions();
  }
}
