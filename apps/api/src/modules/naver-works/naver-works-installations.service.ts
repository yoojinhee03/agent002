import {
  ConflictException,
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
import { NaverWorksAuthService } from './naver-works-auth.service'
import type { UpsertNaverWorksInstallationDto } from './dto/upsert-installation.dto'

export interface InstallationView {
  id: string
  projectId: string
  installedByUserId: string | null
  agentId: string
  botId: string
  botName: string | null
  clientId: string
  serviceAccount: string
  scope: string
  enabled: boolean
  installedAt: Date
  updatedAt: Date
}

export interface DecryptedInstallation extends InstallationView {
  clientSecret: string
  privateKeyPem: string
  botSecret: string
}

const VIEW_SELECT = {
  id: true,
  projectId: true,
  installedByUserId: true,
  agentId: true,
  botId: true,
  botName: true,
  clientId: true,
  serviceAccount: true,
  scope: true,
  enabled: true,
  installedAt: true,
  updatedAt: true,
} as const

@Injectable()
export class NaverWorksInstallationsService {
  private readonly logger = new Logger(NaverWorksInstallationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: NaverWorksAuthService,
  ) {}

  /**
   * 새 봇 등록 또는 기존 botId 갱신.
   * 등록 직후 JWT 토큰 1회 발급으로 자격증명을 검증한다 (Slack 의 auth.test 와 동일 패턴).
   */
  async upsert(
    projectId: string,
    installedByUserId: string,
    dto: UpsertNaverWorksInstallationDto,
  ): Promise<InstallationView> {
    await this.assertAgentBelongsToProject(projectId, dto.agentId)

    const scope = dto.scope?.trim() || 'bot bot.message'

    // 자격증명 검증 — 토큰 발급 시도
    try {
      await this.authService.verifyAndCache({
        botId: dto.botId,
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        serviceAccount: dto.serviceAccount,
        privateKeyPem: dto.privateKey,
        scope,
      })
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err
      throw new UnprocessableEntityException(
        `NAVER WORKS 자격증명 검증 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const data = {
      projectId,
      installedByUserId,
      agentId: dto.agentId,
      botId: dto.botId,
      botName: dto.botName ?? null,
      clientId: dto.clientId,
      clientSecretEnc: encryptCredential(dto.clientSecret),
      serviceAccount: dto.serviceAccount,
      privateKeyEnc: encryptCredential(dto.privateKey),
      botSecretEnc: encryptCredential(dto.botSecret),
      scope,
      enabled: dto.enabled ?? true,
    }

    const existing = await this.prisma.naverWorksInstallation.findUnique({
      where: { botId: dto.botId },
      select: { id: true, projectId: true },
    })

    if (existing && existing.projectId !== projectId) {
      throw new ConflictException(
        `botId ${dto.botId} 는 이미 다른 프로젝트에 등록되어 있습니다.`,
      )
    }

    if (existing) {
      return this.prisma.naverWorksInstallation.update({
        where: { id: existing.id },
        data,
        select: VIEW_SELECT,
      })
    }
    return this.prisma.naverWorksInstallation.create({
      data,
      select: VIEW_SELECT,
    })
  }

  async list(projectId: string): Promise<InstallationView[]> {
    return this.prisma.naverWorksInstallation.findMany({
      where: { projectId },
      orderBy: { installedAt: 'desc' },
      select: VIEW_SELECT,
    })
  }

  async get(id: string): Promise<InstallationView> {
    const row = await this.prisma.naverWorksInstallation.findUnique({
      where: { id },
      select: VIEW_SELECT,
    })
    if (!row) throw new NotFoundException(`NaverWorksInstallation not found: ${id}`)
    return row
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.naverWorksInstallation.findUnique({
      where: { id },
      select: { id: true, botId: true },
    })
    if (!row) throw new NotFoundException(`NaverWorksInstallation not found: ${id}`)
    await this.prisma.naverWorksInstallation.delete({ where: { id } })
    this.authService.invalidate(row.botId)
  }

  async enable(id: string, enabled: boolean): Promise<InstallationView> {
    const row = await this.prisma.naverWorksInstallation.findUnique({
      where: { id },
      select: { id: true, botId: true },
    })
    if (!row) throw new NotFoundException(`NaverWorksInstallation not found: ${id}`)
    if (!enabled) this.authService.invalidate(row.botId)
    return this.prisma.naverWorksInstallation.update({
      where: { id },
      data: { enabled },
      select: VIEW_SELECT,
    })
  }

  async updateAgent(id: string, agentId: string): Promise<InstallationView> {
    const row = await this.prisma.naverWorksInstallation.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })
    if (!row) throw new NotFoundException(`NaverWorksInstallation not found: ${id}`)
    await this.assertAgentBelongsToProject(row.projectId, agentId)
    return this.prisma.naverWorksInstallation.update({
      where: { id },
      data: { agentId },
      select: VIEW_SELECT,
    })
  }

  /**
   * callback 라우팅용 — botId 로 시크릿 복호화한 row 반환.
   * 비활성/존재 X 인 경우 null.
   */
  async getDecryptedByBotId(botId: string): Promise<DecryptedInstallation | null> {
    const row = await this.prisma.naverWorksInstallation.findUnique({
      where: { botId },
    })
    if (!row || !row.enabled) return null
    try {
      return {
        id: row.id,
        projectId: row.projectId,
        installedByUserId: row.installedByUserId,
        agentId: row.agentId,
        botId: row.botId,
        botName: row.botName,
        clientId: row.clientId,
        serviceAccount: row.serviceAccount,
        scope: row.scope,
        enabled: row.enabled,
        installedAt: row.installedAt,
        updatedAt: row.updatedAt,
        clientSecret: decryptCredential(row.clientSecretEnc),
        privateKeyPem: decryptCredential(row.privateKeyEnc),
        botSecret: decryptCredential(row.botSecretEnc),
      }
    } catch (err) {
      this.logger.error(
        `NaverWorksInstallation ${row.id} 시크릿 복호화 실패: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return null
    }
  }

  private async assertAgentBelongsToProject(projectId: string, agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, projectId },
      select: { id: true },
    })
    if (!agent) {
      throw new UnprocessableEntityException(
        `agent ${agentId} 가 project ${projectId} 에 속하지 않습니다.`,
      )
    }
  }
}
