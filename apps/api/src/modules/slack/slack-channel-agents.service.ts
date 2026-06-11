import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { SlackRoutingMode } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateChannelAgentDto } from './dto/create-channel-agent.dto'
import type { UpdateChannelAgentDto } from './dto/update-channel-agent.dto'

@Injectable()
export class SlackChannelAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    return this.prisma.slackChannelAgent.findMany({
      where: { projectId },
      include: {
        agent: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async create(projectId: string, dto: CreateChannelAgentDto) {
    // 단일 워크스페이스 MVP — workspaceTeamId 는 installation 에서 자동 회수
    const installation = await this.prisma.slackInstallation.findFirst({
      where: { projectId },
      select: { workspaceTeamId: true },
    })
    if (!installation) {
      throw new UnprocessableEntityException(
        'Slack 설치 정보가 없습니다. 먼저 봇 토큰을 등록하세요.',
      )
    }

    // agentId 유효성 + 동일 project 검증
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.agentId, projectId },
      select: { id: true },
    })
    if (!agent) {
      throw new NotFoundException(`Agent not found in project: ${dto.agentId}`)
    }

    try {
      return await this.prisma.slackChannelAgent.create({
        data: {
          projectId,
          workspaceTeamId: installation.workspaceTeamId,
          channelId: dto.channelId,
          channelName: dto.channelName ?? null,
          agentId: dto.agentId,
          mode: dto.mode,
        },
        include: {
          agent: { select: { id: true, name: true, slug: true } },
        },
      })
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Unique constraint failed')
      ) {
        throw new ConflictException(
          `이미 해당 채널(${dto.channelId}) + 모드(${dto.mode}) 조합이 존재합니다.`,
        )
      }
      throw err
    }
  }

  async update(id: string, dto: UpdateChannelAgentDto) {
    const row = await this.prisma.slackChannelAgent.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`SlackChannelAgent not found: ${id}`)

    return this.prisma.slackChannelAgent.update({
      where: { id },
      data: {
        ...(dto.mode !== undefined && { mode: dto.mode }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: {
        agent: { select: { id: true, name: true, slug: true } },
      },
    })
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.slackChannelAgent.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`SlackChannelAgent not found: ${id}`)
    await this.prisma.slackChannelAgent.delete({ where: { id } })
  }

  /**
   * 이벤트 핸들러용 매핑 조회.
   * 정확 매칭(channel 또는 dm) 우선, 없으면 both 로 fallback.
   */
  async find(
    teamId: string,
    channelId: string,
    mode: 'channel' | 'dm',
  ): Promise<{ agentId: string; projectId: string } | null> {
    const exactMode: SlackRoutingMode = mode === 'channel' ? SlackRoutingMode.channel : SlackRoutingMode.dm

    const exact = await this.prisma.slackChannelAgent.findFirst({
      where: { workspaceTeamId: teamId, channelId, mode: exactMode, enabled: true },
      select: { agentId: true, projectId: true },
    })
    if (exact) return exact

    const fallback = await this.prisma.slackChannelAgent.findFirst({
      where: { workspaceTeamId: teamId, channelId, mode: SlackRoutingMode.both, enabled: true },
      select: { agentId: true, projectId: true },
    })
    return fallback
  }
}
