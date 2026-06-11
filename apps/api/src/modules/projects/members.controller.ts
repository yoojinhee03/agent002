import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { MembersService } from './members.service'
import { InviteMemberDto } from './dto/invite-member.dto'
import { InviteMultipleDto } from './dto/invite-multiple.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('Project Members')
@ApiBearerAuth()
@Controller('projects')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('invitations/me')
  @ApiOperation({ summary: 'Get my pending invitations across all projects' })
  @ApiResponse({ status: 200, description: 'Invitations retrieved successfully' })
  getMyInvitations(@CurrentUser() user: { id: string; email: string }) {
    return this.membersService.getMyInvitations(user.email)
  }

  @Post(':projectId/members/invite')
  @ApiOperation({ summary: 'Invite a single member to project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Member invited successfully' })
  inviteMember(
    @Param('projectId') projectId: string,
    @Body() data: InviteMemberDto,
  ) {
    return this.membersService.inviteMember(projectId, data)
  }

  @Post(':projectId/members/invite-multiple')
  @ApiOperation({ summary: 'Invite multiple members to project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Members invited successfully' })
  inviteMultiple(
    @Param('projectId') projectId: string,
    @Body() data: InviteMultipleDto,
  ) {
    return this.membersService.inviteMultiple(projectId, data)
  }

  @Patch(':projectId/members/:memberId/accept')
  @ApiOperation({ summary: 'Accept project invitation' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiResponse({ status: 200, description: 'Invitation accepted' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  acceptInvite(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.membersService.acceptInvite(projectId, memberId)
  }

  @Patch(':projectId/members/:memberId/decline')
  @ApiOperation({ summary: 'Decline project invitation' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiResponse({ status: 200, description: 'Invitation declined' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  declineInvite(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.membersService.declineInvite(projectId, memberId)
  }

  @Patch(':projectId/members/:memberId/cancel')
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiResponse({ status: 200, description: 'Invitation cancelled' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  cancelInvite(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body('cancelledBy') cancelledBy: string,
  ) {
    return this.membersService.cancelInvite(projectId, memberId, cancelledBy)
  }

  @Post(':projectId/members/:memberId/resend')
  @ApiOperation({ summary: 'Resend project invitation' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiResponse({ status: 200, description: 'Invitation resent' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  resendInvite(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body('resentBy') resentBy: string,
  ) {
    return this.membersService.resendInvite(projectId, memberId, resentBy)
  }

  @Post(':projectId/members/check-expired')
  @ApiOperation({ summary: 'Check and update expired invitations' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Expired invitations checked' })
  checkExpired(@Param('projectId') projectId: string) {
    return this.membersService.checkExpiredInvites(projectId)
  }

  @Delete(':projectId/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiQuery({ name: 'removedBy', required: false, description: 'Name of person removing' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  removeMember(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Query('removedBy') removedBy?: string,
  ) {
    return this.membersService.removeMember(projectId, memberId, removedBy)
  }

  @Patch(':projectId/members/:memberId/role')
  @ApiOperation({ summary: 'Update member role' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  updateRole(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() data: UpdateRoleDto,
  ) {
    return this.membersService.updateMemberRole(
      projectId,
      memberId,
      data.role,
      data.changedBy,
    )
  }
}
