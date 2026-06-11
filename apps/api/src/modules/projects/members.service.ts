import {
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityLogService } from './activity-log.service'
import { InviteMemberDto } from './dto/invite-member.dto'
import { InviteMultipleDto } from './dto/invite-multiple.dto'
import { MemberRole } from '@prisma/client'

const INVITE_EXPIRATION_DAYS = 7

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async inviteMember(projectId: string, data: InviteMemberDto) {
    const now = new Date()

    const member = await this.prisma.projectMember.create({
      data: {
        projectId,
        name: data.name,
        email: data.email,
        role: data.role as MemberRole,
        status: 'invited',
        invitedAt: now,
        invitedBy: data.invitedBy,
        expiresAt: addDays(now, INVITE_EXPIRATION_DAYS),
        message: data.message,
        avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(data.email)}`,
      },
    })

    await this.activityLogService.create(projectId, {
      action: 'invited',
      memberName: data.name,
      memberEmail: data.email,
      performedBy: data.invitedBy,
      role: data.role as MemberRole,
      message: data.message,
    })

    return member
  }

  async inviteMultiple(projectId: string, data: InviteMultipleDto) {
    const now = new Date()
    const expiresAt = addDays(now, INVITE_EXPIRATION_DAYS)

    const members = await Promise.all(
      data.users.map(async (user) => {
        const member = await this.prisma.projectMember.create({
          data: {
            projectId,
            name: user.name,
            email: user.email,
            role: data.role as MemberRole,
            status: 'invited',
            invitedAt: now,
            invitedBy: data.invitedBy,
            expiresAt,
            message: data.message,
            avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.email)}`,
          },
        })

        await this.activityLogService.create(projectId, {
          action: 'invited',
          memberName: user.name,
          memberEmail: user.email,
          performedBy: data.invitedBy,
          role: data.role as MemberRole,
          message: data.message,
        })

        return member
      }),
    )

    return members
  }

  async acceptInvite(projectId: string, memberId: string) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: {
        status: 'active',
        joinedAt: new Date(),
      },
    })

    await this.activityLogService.create(projectId, {
      action: 'accepted',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: member.name,
      role: member.role,
    })

    return { success: true }
  }

  async declineInvite(projectId: string, memberId: string) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: {
        status: 'declined',
        declinedAt: new Date(),
      },
    })

    await this.activityLogService.create(projectId, {
      action: 'declined',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: member.name,
      role: member.role,
    })

    return { success: true }
  }

  async cancelInvite(projectId: string, memberId: string, cancelledBy: string) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    })

    await this.activityLogService.create(projectId, {
      action: 'cancelled',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: cancelledBy,
      role: member.role,
    })

    return { success: true }
  }

  async resendInvite(projectId: string, memberId: string, resentBy: string) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    const now = new Date()
    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: {
        status: 'invited',
        expiresAt: addDays(now, INVITE_EXPIRATION_DAYS),
        invitedAt: now,
      },
    })

    await this.activityLogService.create(projectId, {
      action: 'resent',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: resentBy,
      role: member.role,
    })

    return { success: true }
  }

  async checkExpiredInvites(projectId: string) {
    const now = new Date()

    const expiredMembers = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        status: 'invited',
        expiresAt: { lt: now },
      },
    })

    if (expiredMembers.length > 0) {
      await this.prisma.projectMember.updateMany({
        where: {
          id: { in: expiredMembers.map((m) => m.id) },
        },
        data: { status: 'expired' },
      })

      for (const member of expiredMembers) {
        await this.activityLogService.create(projectId, {
          action: 'expired',
          memberName: member.name,
          memberEmail: member.email,
          performedBy: 'system',
          role: member.role,
        })
      }
    }

    return { expiredCount: expiredMembers.length }
  }

  async getMyInvitations(userEmail: string) {
    const members = await this.prisma.projectMember.findMany({
      where: {
        email: userEmail,
        status: 'invited',
      },
      include: {
        project: true,
      },
    })

    return members.map((member) => ({
      project: member.project,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        invitedAt: member.invitedAt,
        invitedBy: member.invitedBy,
        expiresAt: member.expiresAt,
        message: member.message,
      },
    }))
  }

  async removeMember(projectId: string, memberId: string, removedBy?: string) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    await this.prisma.projectMember.delete({
      where: { id: memberId },
    })

    await this.activityLogService.create(projectId, {
      action: 'removed',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: removedBy || 'unknown',
      role: member.role,
    })

    return { success: true }
  }

  async updateMemberRole(
    projectId: string,
    memberId: string,
    role: string,
    changedBy?: string,
  ) {
    const member = await this.findMemberOrThrow(projectId, memberId)

    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: { role: role as MemberRole },
    })

    await this.activityLogService.create(projectId, {
      action: 'role_changed',
      memberName: member.name,
      memberEmail: member.email,
      performedBy: changedBy || 'unknown',
      role: role as MemberRole,
    })

    return { success: true }
  }

  private async findMemberOrThrow(projectId: string, memberId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    })
    if (!member) {
      throw new NotFoundException(
        `Member with ID "${memberId}" not found in project "${projectId}"`,
      )
    }
    return member
  }
}
