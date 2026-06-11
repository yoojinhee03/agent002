import { Injectable, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityAction, MemberRole } from '@prisma/client'

export interface CreateActivityLogData {
  action: ActivityAction
  memberName: string
  memberEmail: string
  performedBy: string
  role?: MemberRole
  message?: string
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, data: CreateActivityLogData) {
    return this.prisma.projectActivityLog.create({
      data: {
        projectId,
        action: data.action,
        memberName: data.memberName,
        memberEmail: data.memberEmail,
        performedBy: data.performedBy,
        role: data.role,
        message: data.message,
      },
    })
  }

  async findByProject(projectId: string, userEmail: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    })

    if (!project) return []

    const isMember = project.members.some(
      (m) => m.email === userEmail && m.status === 'active',
    )

    if (!isMember) {
      throw new ForbiddenException('You do not have access to this project')
    }

    return this.prisma.projectActivityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })
  }
}
