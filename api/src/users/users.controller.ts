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
  @ApiOperation({ summary: 'Create a new operator user' })
  @ApiCreatedResponse()
  @Post()
  createUser(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.svc.createUser(dto, req.user.userId);
  }

  @RequirePermission('user:read')
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse()
  @Get()
  listUsers(@Query() query: UserListQueryDto) {
    return this.svc.listUsers(query);
  }

  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiOkResponse()
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.svc.getUserById(id);
  }

  @RequirePermission('user:update')
  @ApiOperation({ summary: 'Update user email or display name' })
  @ApiOkResponse()
  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.svc.updateUser(id, dto);
  }

  @RequirePermission('user:deactivate')
  @ApiOperation({ summary: 'Deactivate a user account' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/deactivate')
  deactivateUser(@Param('id') id: string, @Request() req: any) {
    return this.svc.deactivateUser(id, req.user.userId);
  }

  @RequirePermission('user:update')
  @ApiOperation({ summary: 'Change a user password' })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Patch(':id/password')
  async changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    await this.svc.changePassword(id, dto);
  }

  @RequirePermission('user:assign-role')
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
  @ApiOperation({ summary: 'List active role assignments for a user' })
  @ApiOkResponse()
  @Get(':id/roles')
  getUserRoles(@Param('id') id: string) {
    return this.svc.getUserRoles(id);
  }

  @RequirePermission('user:assign-role')
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
