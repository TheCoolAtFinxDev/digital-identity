import {
  Body,
  Controller,
  Delete,
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
import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @RequirePermission('user:create')
  @GlobalScope()
  @ApiOperation({ summary: 'Create a new operator user' })
  @ApiCreatedResponse()
  @Post()
  createUser(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.svc.createUser(dto, req.user.userId);
  }

  @RequirePermission('user:read')
  @GlobalScope()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse()
  @Get()
  listUsers(@Query() query: UserListQueryDto) {
    return this.svc.listUsers(query);
  }

  @RequirePermission('user:read')
  @ScopedTo({ target: 'USER', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiOkResponse()
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.svc.getUserById(id);
  }

  @RequirePermission('user:update')
  @ScopedTo({ target: 'USER', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Update user email or display name' })
  @ApiOkResponse()
  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.svc.updateUser(id, dto);
  }

  @RequirePermission('user:deactivate')
  @ScopedTo({ target: 'USER', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Deactivate a user account' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/deactivate')
  deactivateUser(@Param('id') id: string, @Request() req: any) {
    return this.svc.deactivateUser(id, req.user.userId);
  }

  @RequirePermission('user:update')
  @ScopedTo({ target: 'USER', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'Change a user password' })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Patch(':id/password')
  async changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    await this.svc.changePassword(id, dto);
  }

  @RequirePermission('user:assign-role')
  // Not narrowable, deliberately. Granting roles is how authority is created, so
  // a unit-scoped operator who could do it inside their own unit could mint
  // themselves anything — including a GLOBAL role. Delegating this needs a rule
  // about which roles may be granted at which scope, which does not exist yet.
  @GlobalScope()
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiCreatedResponse()
  @Post(':id/roles')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @Request() req: any,
  ) {
    return this.svc.assignRole(id, dto, req.user.userId);
  }

  @RequirePermission('user:read')
  @ScopedTo({ target: 'USER', from: 'param', name: 'id' })
  @ApiOperation({ summary: 'List active role assignments for a user' })
  @ApiOkResponse()
  @Get(':id/roles')
  getUserRoles(@Param('id') id: string) {
    return this.svc.getUserRoles(id);
  }

  @RequirePermission('user:assign-role')
  // Not narrowable — same reason as assigning. See above.
  @GlobalScope()
  @ApiOperation({ summary: 'Revoke a role assignment' })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Delete(':id/roles/:assignmentId')
  async revokeRole(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: any,
  ) {
    await this.svc.revokeRole(id, assignmentId, req.user.userId);
  }
}
