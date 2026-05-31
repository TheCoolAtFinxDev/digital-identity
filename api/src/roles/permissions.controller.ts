import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('v1/permissions')
export class PermissionsController {
  constructor(private readonly svc: RolesService) {}

  @ApiOperation({ summary: 'List all permission codes' })
  @ApiOkResponse()
  @Get()
  listPermissions() {
    return this.svc.listPermissions();
  }
}
