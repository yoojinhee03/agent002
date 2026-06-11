import { Injectable, NotFoundException, HttpException, ForbiddenException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { decryptCredential } from '../../common/credential-cipher'
import type { CreateThreadRequest, ThreadStatus, RequiredUserField } from '@agent-studio/shared'

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name)
  constructor(private prisma: PrismaService) {}

  /**
   * 사용자 자격증명을 `kind:targetId → 평문` dict 로 복호화한다.
   * 복호화 실패한 행은 skip 하여 부분 자격증명만 inject (전체 실패 방지).
   * runner 측 deepagent_bridge 가 `provider:{slug}` 키로 조회한다.
   */
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

  async create(projectIdOrSlug: string, userId: string, dto: CreateThreadRequest) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    return this.prisma.thread.create({
      data: {
        projectId,
        agentId: dto.agentId,
        teamId: dto.teamId,
        agentDeploymentId: dto.agentDeploymentId,
        title: dto.title,
        userId,
        metadata: (dto.metadata as object) || {},
      },
    })
  }

  async list(projectIdOrSlug: string, options?: { status?: ThreadStatus; limit?: number; offset?: number }) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    // 주의: Prisma 의 `NOT: { metadata: { path: ['kind'], equals: 'assistant' } }` 는
    // PostgreSQL 에서 `NOT (metadata->>'kind' = 'assistant')` 로 변환된다.
    // metadata.kind 가 NULL 인 경우 비교 결과가 NULL → NOT NULL 도 NULL → false 로 평가되어
    // **NULL 인 모든 thread 가 제외**되는 회귀가 있었다 (client 사이드바 빈 결과 원인).
    // application-level filter 로 NULL safe 하게 처리한다.
    const rows = await this.prisma.thread.findMany({
      where: {
        projectId,
        ...(options?.status ? { status: options.status } : {}),
      },
      include: {
        agent: { select: { id: true, name: true, slug: true, architecture: true } },
        team: { select: { id: true, name: true, slug: true, topology: true } },
        _count: { select: { interactions: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    })
    return rows.filter((t) => {
      const md = t.metadata as { kind?: string } | null
      return md?.kind !== 'assistant'
    })
  }

  async get(threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        agent: { select: { id: true, name: true, slug: true, architecture: true, systemPrompt: true } },
        team: { select: { id: true, name: true, slug: true, topology: true } },
        interactions: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!thread) throw new NotFoundException(`Thread not found: ${threadId}`)
    return thread
  }

  async archive(threadId: string) {
    await this.get(threadId)
    return this.prisma.thread.update({
      where: { id: threadId },
      data: { status: 'archived' },
    })
  }

  async update(threadId: string, data: { title?: string }) {
    await this.get(threadId)
    const patch: { title?: string } = {}
    if (typeof data.title === 'string') patch.title = data.title.slice(0, 200)
    return this.prisma.thread.update({
      where: { id: threadId },
      data: patch,
    })
  }

  private get runnerUrl() {
    return process.env.RUNNER_URL || 'http://localhost:4300'
  }

  private get runnerKey() {
    return process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
  }

  private mapRunnerStatus(status: number): number {
    // runner의 4xx를 JWT 401과 혼동하지 않도록 502로 매핑
    if (status === 401 || status === 403) return 502
    return status
  }

  async resume(
    threadId: string,
    approved: boolean,
    userId?: string,
    source?: 'studio' | 'client',
  ) {
    const userCredentials = userId ? await this.collectUserCredentials(userId) : undefined
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.runnerKey,
      },
      body: JSON.stringify({ approved, userCredentials, userId, source }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(err.detail || err.message || 'Runner request failed', this.mapRunnerStatus(res.status))
    }
    return res.json()
  }

  /**
   * per_user MCP 서버 게이트: agent 가 사용하는 MCP 서버 중 credentialMode=per_user 인 것에 대해
   * 호출자 userId 의 UserCredential(kind=mcp, targetId=serverId) 존재 여부를 검증한다.
   * 누락 시 403 + MissingMcpCredential 페이로드를 throw 한다.
   *
   * 동시에 per_user 서버의 복호화된 env dict ({ [serverId]: { KEY: VALUE } }) 를 반환하여
   * runner 페이로드에 포함시킨다.
   */
  private async checkAndCollectMcpCredentials(
    agentId: string,
    userId: string,
  ): Promise<Record<string, Record<string, string>>> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { mcpServerIds: true, mcpToolRefs: true },
    })
    if (!agent) return {}

    // mcpToolRefs 우선, 없으면 mcpServerIds 로 서버 id 목록 구성
    const mcpToolRefs = agent.mcpToolRefs as Array<{ serverId: string; toolName: string }> | null
    const serverIds: string[] = mcpToolRefs && mcpToolRefs.length > 0
      ? [...new Set(mcpToolRefs.map((r) => r.serverId))]
      : (agent.mcpServerIds as string[]) ?? []

    if (serverIds.length === 0) return {}

    const servers = await this.prisma.mcpServer.findMany({
      where: { id: { in: serverIds }, credentialMode: 'per_user' },
      select: { id: true, name: true, requiredUserFields: true, config: true },
    })

    if (servers.length === 0) return {}

    const existingCreds = await this.prisma.userCredential.findMany({
      where: { userId, kind: 'mcp', targetId: { in: servers.map((s) => s.id) }, status: 'active' },
      select: { targetId: true, valueEnc: true },
    })
    const credByServer = new Map<string, string>(existingCreds.map((c) => [c.targetId, c.valueEnc]))

    const missingItems: Array<{
      serverId: string
      serverName: string
      fields: RequiredUserField[]
    }> = []

    for (const server of servers) {
      if (!credByServer.has(server.id)) {
        const cfg = (server.config ?? {}) as { env?: Record<string, string> }
        const rawFields = server.requiredUserFields
        const fields: RequiredUserField[] =
          Array.isArray(rawFields) && rawFields.length > 0
            ? (rawFields as unknown as RequiredUserField[])
            : Object.keys(cfg.env ?? {}).map((key) => ({
                key,
                label: key,
                secret: true,
                required: true,
              }))
        missingItems.push({ serverId: server.id, serverName: server.name, fields })
      }
    }

    if (missingItems.length > 0) {
      throw new ForbiddenException({
        error: 'MissingMcpCredential',
        missingCredentials: missingItems,
      })
    }

    // 모든 per_user 서버에 자격증명이 있음 → 복호화해서 env dict 구성
    const userMcpEnvs: Record<string, Record<string, string>> = {}
    for (const server of servers) {
      const enc = credByServer.get(server.id)
      if (!enc) continue
      try {
        const plain = decryptCredential(enc)
        userMcpEnvs[server.id] = JSON.parse(plain) as Record<string, string>
      } catch (err) {
        this.logger.warn(
          `MCP credential decrypt failed [serverId=${server.id}, userId=${userId}]: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    return userMcpEnvs
  }

  async invoke(
    threadId: string,
    content: string,
    userId?: string,
    architectureOverride?: string,
    source?: 'studio' | 'client',
  ) {
    const userCredentials = userId ? await this.collectUserCredentials(userId) : undefined

    // thread 의 agentId 를 조회하여 MCP 실행 게이트 적용
    let userMcpEnvs: Record<string, Record<string, string>> | undefined
    if (userId) {
      const thread = await this.prisma.thread.findUnique({
        where: { id: threadId },
        select: { agentId: true },
      })
      if (thread?.agentId) {
        userMcpEnvs = await this.checkAndCollectMcpCredentials(thread.agentId, userId)
      }
    }

    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.runnerKey,
      },
      body: JSON.stringify({
        content,
        userCredentials,
        userMcpEnvs,
        userId,
        architectureOverride,
        source,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(err.detail || err.message || 'Runner request failed', this.mapRunnerStatus(res.status))
    }
    return res.json()
  }

  async getMessages(threadId: string) {
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/messages`, {
      headers: { 'X-API-Key': this.runnerKey },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(err.detail || err.message || 'Runner request failed', this.mapRunnerStatus(res.status))
    }
    return res.json()
  }

  async getRuns(threadId: string) {
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/runs`, {
      headers: { 'X-API-Key': this.runnerKey },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(err.detail || err.message || 'Runner request failed', this.mapRunnerStatus(res.status))
    }
    return res.json()
  }

  async cancel(threadId: string) {
    const res = await fetch(`${this.runnerUrl}/api/v1/threads/${threadId}/cancel`, {
      method: 'POST',
      headers: { 'X-API-Key': this.runnerKey },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return res.json()
  }

  async uploadAttachment(
    threadId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
    uploaderId?: string,
  ) {
    // multer 는 multipart filename 을 latin-1 로 디코딩하므로 한글이 깨진다.
    // 원본 바이트 시퀀스를 UTF-8 로 재디코딩해 복원.
    const fixedName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    const form = new FormData()
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      fixedName,
    )
    if (uploaderId) form.append('uploader_id', uploaderId)
    const res = await fetch(
      `${this.runnerUrl}/api/v1/threads/${threadId}/attachments`,
      {
        method: 'POST',
        headers: { 'X-API-Key': this.runnerKey },
        body: form,
      },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return res.json()
  }

  async listAttachments(threadId: string) {
    const res = await fetch(
      `${this.runnerUrl}/api/v1/threads/${threadId}/attachments`,
      { headers: { 'X-API-Key': this.runnerKey } },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return res.json()
  }

  async downloadAttachment(attachmentId: string): Promise<{ body: ArrayBuffer; contentType: string; filename: string }> {
    const res = await fetch(
      `${this.runnerUrl}/api/v1/thread-attachments/${attachmentId}/content`,
      { headers: { 'X-API-Key': this.runnerKey } },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const disposition = res.headers.get('content-disposition') || ''
    const match = disposition.match(/filename="?([^"]+)"?/i)
    const filename = match ? match[1] : 'download'
    const body = await res.arrayBuffer()
    return { body, contentType, filename }
  }

  async deleteAttachment(attachmentId: string) {
    const res = await fetch(
      `${this.runnerUrl}/api/v1/thread-attachments/${attachmentId}`,
      { method: 'DELETE', headers: { 'X-API-Key': this.runnerKey } },
    )
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        this.mapRunnerStatus(res.status),
      )
    }
    return { deleted: true }
  }
}
