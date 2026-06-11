import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { InviteUserDto, RegisterUserDto } from './dto/create-user.dto'
import {
  UpdateUserDto,
  ChangePasswordDto,
  ChangeMyPasswordDto,
  UpdateUserRoleDto,
} from './dto/update-user.dto'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  findAll() {
    return this.usersService.findAll()
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in user' })
  @ApiResponse({ status: 200, description: 'Current user retrieved successfully' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.findById(user.id)
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by name or email' })
  @ApiQuery({ name: 'q', description: 'Search query (case insensitive, active users only)' })
  @ApiResponse({ status: 200, description: 'Search results retrieved successfully' })
  search(@Query('q') query: string) {
    return this.usersService.search(query)
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Post('invite')
  @Roles('admin')
  @ApiOperation({ summary: 'Invite a new user (admin only)' })
  @ApiResponse({ status: 201, description: 'User invited successfully' })
  @ApiResponse({ status: 409, description: 'User with this email already exists' })
  invite(@Body() data: InviteUserDto) {
    return this.usersService.invite(data)
  }

  @Post('register')
  @Roles('admin')
  @ApiOperation({ summary: 'Register a new active user (admin only)' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User with this email already exists' })
  register(@Body() data: RegisterUserDto) {
    return this.usersService.registerDirect(data)
  }

  @Patch(':id/activate')
  @Roles('admin')
  @ApiOperation({ summary: 'Activate a pending user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  @ApiResponse({ status: 400, description: 'User is not in pending status' })
  @ApiResponse({ status: 404, description: 'User not found' })
  activate(@Param('id') id: string) {
    return this.usersService.activate(id)
  }

  @Patch(':id/role')
  @Roles('admin')
  @ApiOperation({ summary: 'Update system role for a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot demote the last system admin' })
  @ApiResponse({ status: 403, description: 'Cannot change your own role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateRole(
    @Param('id') id: string,
    @Body() data: UpdateUserRoleDto,
    @CurrentUser() currentUser: { id: string },
  ) {
    return this.usersService.updateRole(id, data.role, currentUser.id)
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user profile (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Param('id') id: string, @Body() data: UpdateUserDto) {
    return this.usersService.update(id, data)
  }

  // 정적 경로(me/password)를 동적 경로(:id/password)보다 먼저 선언 — NestJS 라우팅이
  // 등록 순서대로 매칭하므로 순서를 뒤집으면 :id="me" 로 잡혀 admin 가드에 걸린다.
  @Patch('me/password')
  @ApiOperation({ summary: '본인 비밀번호 변경 — 현재 비밀번호 검증 필수' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: '현재 비밀번호가 올바르지 않음' })
  changeMyPassword(
    @CurrentUser('id') userId: string,
    @Body() data: ChangeMyPasswordDto,
  ) {
    return this.usersService.changeMyPassword(userId, data.currentPassword, data.newPassword)
  }

  @Patch(':id/password')
  @Roles('admin')
  @ApiOperation({ summary: 'Change user password (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  changePassword(@Param('id') id: string, @Body() data: ChangePasswordDto) {
    return this.usersService.changePassword(id, data.newPassword)
  }

  @Post(':id/resend-invite')
  @Roles('admin')
  @ApiOperation({ summary: 'Resend invite for a pending user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Invite resent successfully' })
  @ApiResponse({ status: 400, description: 'User is not in pending status' })
  @ApiResponse({ status: 404, description: 'User not found' })
  resendInvite(@Param('id') id: string) {
    return this.usersService.resendInvite(id)
  }
}
