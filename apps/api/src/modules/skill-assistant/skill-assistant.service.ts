import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { decryptCredential } from '../../common/credential-cipher'

export interface CreateSkillSessionResult {
  threadId: string
  model: string
}

@Injectable()
export class SkillAssistantService {
  private readonly logger = new Logger(SkillAssistantService.name)

  constructor(private readonly prisma: PrismaService) {}

  private get runnerUrl(): string {
    return process.env.RUNNER_URL || 'http://localhost:4300'
  }

  private get runnerKey(): string {
    return process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
  }

  private mapRunnerStatus(status: number): number {
    return status === 401 || status === 403 ? 502 : status
  }

  private async collectUserCredentials(userId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.userCredential.findMany({
      where: { userId, status: 'active' },
      select: { kind: true, targetId: true, valueEnc: true },
    })
    const dict: Record<string, string> = {}
    for (const r of rows) {
      try {
        dict[`${r.kind}:${r.targetId}`] = decryptCredential(r.valueEnc)
      } catch (err) {
        this.logger.warn(
          `decrypt failed for credential ${r.kind}:${r.targetId} (userId=${userId}): ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        )
      }
    }
    return dict
  }

  private async loadSkillContext(
    skillId: string,
    userId: string,
  ): Promise<{ id: string; userId: string }> {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true, userId: true },
    })
    if (!skill) throw new NotFoundException(`Skill not found: ${skillId}`)
    if (skill.userId !== userId) throw new NotFoundException(`Skill not found: ${skillId}`)
    return skill
  }

  async createSession(
    userId: string,
    model: string | undefined,
    skillId: string | undefined,
    mode?: string,
  ): Promise<CreateSkillSessionResult> {
    if (skillId) {
      await this.loadSkillContext(skillId, userId)
    }
    const res = await fetch(`${this.runnerUrl}/api/v1/skill-assistant/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
      body: JSON.stringify({
        userId,
        model: model ?? null,
        skillId: skillId ?? null,
        ...(mode ? { mode } : {}),
      }),
    })
    return this.handleRunnerResponse<CreateSkillSessionResult>(res)
  }

  async invoke(threadId: string, userId: string, message: string, mode?: string) {
    const userCredentials = await this.collectUserCredentials(userId)
    const res = await fetch(
      `${this.runnerUrl}/api/v1/skill-assistant/sessions/${threadId}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
        body: JSON.stringify({
          message,
          userCredentials,
          userId,
          ...(mode ? { mode } : {}),
        }),
      },
    )
    return this.handleRunnerResponse<{ threadId: string; accepted: boolean }>(res)
  }

  private async handleRunnerResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string
        message?: string
      }
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return (await res.json()) as T
  }
}
