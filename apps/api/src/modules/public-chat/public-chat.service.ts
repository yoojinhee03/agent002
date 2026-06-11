import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

interface DeploymentContext {
  id: string
  projectId: string
  agentId: string
}

@Injectable()
export class PublicChatService {
  constructor(private readonly prisma: PrismaService) {}

  private get runnerUrl() {
    return process.env.RUNNER_URL || 'http://localhost:4300'
  }

  private get runnerKey() {
    return process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
  }

  private mapRunnerStatus(status: number): number {
    return status === 401 || status === 403 ? 502 : status
  }

  async createThread(
    deployment: DeploymentContext,
    title?: string,
    metadata?: Record<string, unknown>,
  ) {
    const thread = await this.prisma.thread.create({
      data: {
        projectId: deployment.projectId,
        agentId: deployment.agentId,
        agentDeploymentId: deployment.id,
        title: title ?? null,
        userId: null,
        metadata: (metadata as object) ?? {},
      },
      select: { id: true, status: true, title: true, createdAt: true, agentDeploymentId: true },
    })
    const agent = await this.prisma.agent.findUnique({
      where: { id: deployment.agentId },
      select: { id: true, slug: true, name: true },
    })
    return {
      threadId: thread.id,
      agentDeploymentId: thread.agentDeploymentId,
      agent,
      title: thread.title,
      status: thread.status,
      createdAt: thread.createdAt,
    }
  }

  private async assertOwnership(threadId: string, deploymentId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, agentDeploymentId: true },
    })
    if (!thread) throw new NotFoundException(`Thread not found: ${threadId}`)
    if (thread.agentDeploymentId !== deploymentId) {
      throw new ForbiddenException('Thread does not belong to this API key deployment')
    }
  }

  async invoke(threadId: string, deploymentId: string, message: string) {
    await this.assertOwnership(threadId, deploymentId)
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
      body: JSON.stringify({ message }),
    })
    return this.handleRunnerResponse(res)
  }

  async resume(
    threadId: string,
    deploymentId: string,
    decisions: Array<Record<string, unknown>>,
  ) {
    await this.assertOwnership(threadId, deploymentId)
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.runnerKey },
      body: JSON.stringify({ decisions }),
    })
    return this.handleRunnerResponse(res)
  }

  async getMessages(threadId: string, deploymentId: string) {
    await this.assertOwnership(threadId, deploymentId)
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/messages`, {
      headers: { 'X-API-Key': this.runnerKey },
    })
    return this.handleRunnerResponse(res)
  }

  private async handleRunnerResponse(res: Response) {
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string; message?: string }
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return res.json()
  }
}
