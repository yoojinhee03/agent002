import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { decryptCredential } from '../../common/credential-cipher'

interface SessionContext {
  agentId: string
  projectId: string
}

export interface CreateSessionResult {
  threadId: string
  targetAgentId: string
  model: string
}

@Injectable()
export class AgentAssistantService {
  private readonly logger = new Logger(AgentAssistantService.name)

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

  private async loadAgentContext(agentId: string): Promise<SessionContext> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, projectId: true },
    })
    if (!agent) throw new NotFoundException(`Agent not found: ${agentId}`)
    return { agentId: agent.id, projectId: agent.projectId }
  }

  async createSession(
    agentId: string,
    userId: string,
    model: string | undefined,
  ): Promise<CreateSessionResult> {
    const ctx = await this.loadAgentContext(agentId)
    const res = await fetch(`${this.runnerUrl}/api/v1/agent-assistant/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
      body: JSON.stringify({
        projectId: ctx.projectId,
        agentId: ctx.agentId,
        userId,
        model: model ?? null,
      }),
    })
    return this.handleRunnerResponse<CreateSessionResult>(res)
  }

  async invoke(agentId: string, threadId: string, userId: string, message: string) {
    await this.loadAgentContext(agentId)
    const userCredentials = await this.collectUserCredentials(userId)
    const res = await fetch(
      `${this.runnerUrl}/api/v1/agent-assistant/sessions/${threadId}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
        body: JSON.stringify({ message, userCredentials, userId }),
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
