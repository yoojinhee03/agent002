import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  decryptCredential,
  encryptCredential,
} from '../../common/credential-cipher'
import type { UpsertInstallationDto } from './dto/upsert-installation.dto'

export interface InstallationView {
  id: string
  projectId: string
  installedByUserId: string | null
  workspaceTeamId: string
  workspaceName: string | null
  botUserId: string | null
  enabled: boolean
  installedAt: Date
}

@Injectable()
export class SlackInstallationsService {
  private readonly logger = new Logger(SlackInstallationsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    projectId: string,
    installedByUserId: string,
    dto: UpsertInstallationDto,
  ): Promise<InstallationView> {
    // Slack auth.test 호출로 teamId/botUserId/workspaceName 회수
    const authResult = await this.callSlackAuthTest(dto.botToken)

    const botTokenEnc = encryptCredential(dto.botToken)
    const appTokenEnc = encryptCredential(dto.appToken)

    const existing = await this.prisma.slackInstallation.findFirst({
      where: { projectId },
    })

    const selectFields = {
      id: true,
      projectId: true,
      installedByUserId: true,
      workspaceTeamId: true,
      workspaceName: true,
      botUserId: true,
      enabled: true,
      installedAt: true,
    } as const

    if (existing) {
      return this.prisma.slackInstallation.update({
        where: { id: existing.id },
        data: {
          installedByUserId,
          workspaceTeamId: authResult.teamId,
          workspaceName: authResult.teamName,
          botUserId: authResult.botUserId,
          botTokenEnc,
          appTokenEnc,
          enabled: dto.enabled ?? true,
        },
        select: selectFields,
      })
    }
    return this.prisma.slackInstallation.create({
      data: {
        projectId,
        installedByUserId,
        workspaceTeamId: authResult.teamId,
        workspaceName: authResult.teamName,
        botUserId: authResult.botUserId,
        botTokenEnc,
        appTokenEnc,
        enabled: dto.enabled ?? true,
      },
      select: selectFields,
    })
  }

  async get(projectId: string): Promise<InstallationView | null> {
    return this.prisma.slackInstallation.findFirst({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        installedByUserId: true,
        workspaceTeamId: true,
        workspaceName: true,
        botUserId: true,
        enabled: true,
        installedAt: true,
      },
    })
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.slackInstallation.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`SlackInstallation not found: ${id}`)
    await this.prisma.slackInstallation.delete({ where: { id } })
  }

  async enable(id: string, enabled: boolean): Promise<InstallationView> {
    const row = await this.prisma.slackInstallation.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`SlackInstallation not found: ${id}`)

    return this.prisma.slackInstallation.update({
      where: { id },
      data: { enabled },
      select: {
        id: true,
        projectId: true,
        installedByUserId: true,
        workspaceTeamId: true,
        workspaceName: true,
        botUserId: true,
        enabled: true,
        installedAt: true,
      },
    })
  }

  /** Bolt App 부팅용 — 복호화된 토큰 포함 row 반환 */
  async getWithDecryptedTokens(
    filter: { enabled?: boolean } = {},
  ): Promise<{
    id: string
    projectId: string
    installedByUserId: string | null
    workspaceTeamId: string
    botToken: string
    appToken: string
  } | null> {
    const row = await this.prisma.slackInstallation.findFirst({
      where: filter.enabled !== undefined ? { enabled: filter.enabled } : {},
    })
    if (!row) return null

    let botToken: string
    let appToken: string
    try {
      botToken = decryptCredential(row.botTokenEnc)
      appToken = decryptCredential(row.appTokenEnc)
    } catch (err) {
      this.logger.error('토큰 복호화 실패', err)
      return null
    }

    return {
      id: row.id,
      projectId: row.projectId,
      installedByUserId: row.installedByUserId,
      workspaceTeamId: row.workspaceTeamId,
      botToken,
      appToken,
    }
  }

  private async callSlackAuthTest(
    botToken: string,
  ): Promise<{ teamId: string; teamName: string; botUserId: string }> {
    let res: Response
    try {
      res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
      })
    } catch (err) {
      throw new UnprocessableEntityException(`Slack auth.test 네트워크 오류: ${String(err)}`)
    }

    if (!res.ok) {
      throw new UnprocessableEntityException(`Slack auth.test HTTP ${res.status}`)
    }

    const data = (await res.json()) as {
      ok: boolean
      team_id?: string
      team?: string
      user_id?: string
      error?: string
    }

    if (!data.ok) {
      throw new UnprocessableEntityException(`Slack auth.test 실패: ${data.error ?? 'unknown'}`)
    }

    return {
      teamId: data.team_id ?? '',
      teamName: data.team ?? '',
      botUserId: data.user_id ?? '',
    }
  }
}
