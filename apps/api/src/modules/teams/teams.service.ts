import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateTeamRequest, UpdateTeamRequest, AddTeamAgentRequest, AddSubTeamRequest } from '@agent-studio/shared'

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  private async resolveProjectId(idOrSlug: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    if (isUuid) return idOrSlug

    const project = await this.prisma.project.findUnique({
      where: { slug: idOrSlug },
      select: { id: true },
    })
    if (!project) throw new NotFoundException(`Project not found: ${idOrSlug}`)
    return project.id
  }

  /**
   * 슬러그 후보(없으면 이름)에서 a-z/0-9/하이픈만 남기고, 비어 있으면 'team'을 사용.
   * 동일 프로젝트 내 충돌 시 `-2`, `-3` ... 접미사를 붙여 유니크하게 만든다.
   */
  private async resolveUniqueSlug(
    projectId: string,
    candidate: string | undefined,
    name: string,
  ): Promise<string> {
    const normalize = (raw: string) =>
      raw
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')

    const fromCandidate = candidate ? normalize(candidate) : ''
    const baseSlug = fromCandidate || normalize(name) || 'team'

    let slug = baseSlug
    let suffix = 2
    while (true) {
      const conflict = await this.prisma.agentTeam.findUnique({
        where: { projectId_slug: { projectId, slug } },
      })
      if (!conflict) return slug
      slug = `${baseSlug}-${suffix++}`
    }
  }

  async create(projectIdOrSlug: string, dto: CreateTeamRequest) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    const slug = await this.resolveUniqueSlug(projectId, dto.slug, dto.name)

    return this.prisma.agentTeam.create({
      data: {
        projectId,
        name: dto.name,
        slug,
        description: dto.description || '',
        topology: dto.topology || 'supervisor',
        config: (dto.config as object) || {},
      },
    })
  }

  async list(projectIdOrSlug: string) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    return this.prisma.agentTeam.findMany({
      where: { projectId },
      include: {
        teamAgents: {
          include: { agent: { select: { id: true, name: true, slug: true, type: true } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async get(teamId: string) {
    const team = await this.prisma.agentTeam.findUnique({
      where: { id: teamId },
      include: {
        teamAgents: {
          include: { agent: true },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!team) throw new NotFoundException(`Team not found: ${teamId}`)
    return team
  }

  async update(teamId: string, dto: UpdateTeamRequest) {
    await this.get(teamId)
    return this.prisma.agentTeam.update({
      where: { id: teamId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.topology !== undefined && { topology: dto.topology }),
        ...(dto.config !== undefined && { config: dto.config as object }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    })
  }

  async delete(teamId: string) {
    await this.get(teamId)
    return this.prisma.agentTeam.delete({ where: { id: teamId } })
  }

  async addAgent(teamId: string, dto: AddTeamAgentRequest) {
    await this.get(teamId)
    return this.prisma.teamAgent.create({
      data: {
        teamId,
        agentId: dto.agentId,
        role: dto.role || 'worker',
        routingCondition: dto.routingCondition,
        order: dto.order || 0,
      },
    })
  }

  async removeAgent(teamId: string, agentId: string) {
    const entry = await this.prisma.teamAgent.findFirst({ where: { teamId, agentId } })
    if (!entry) throw new NotFoundException(`Agent not found in team`)
    return this.prisma.teamAgent.delete({ where: { id: entry.id } })
  }

  async addSubTeam(teamId: string, dto: AddSubTeamRequest) {
    await this.get(teamId)
    const subTeam = await this.prisma.agentTeam.findUnique({ where: { id: dto.subTeamId } })
    if (!subTeam) throw new NotFoundException(`SubTeam not found: ${dto.subTeamId}`)
    return this.prisma.teamAgent.create({
      data: {
        teamId,
        subTeamId: dto.subTeamId,
        role: dto.role || 'sub_team',
        order: dto.order || 0,
      },
    })
  }

  async removeSubTeam(teamId: string, subTeamId: string) {
    const entry = await this.prisma.teamAgent.findFirst({ where: { teamId, subTeamId } })
    if (!entry) throw new NotFoundException(`SubTeam not found in team`)
    return this.prisma.teamAgent.delete({ where: { id: entry.id } })
  }

  async invokeStub(teamId: string, message: string) {
    const team = await this.get(teamId)
    // Stub: 실제 실행은 agent-runner에서 담당, 여기서는 메타 정보 반환
    return {
      teamId,
      teamName: team.name,
      topology: team.topology,
      message: `[${team.name}] Invoke via management API stub — use agent-runner for actual execution`,
      messages: [{ role: 'assistant', content: `[${team.name}] (stub) ${message.substring(0, 100)}...` }],
    }
  }
}
