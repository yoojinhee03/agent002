import { HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class HitlService {
  constructor(private prisma: PrismaService) {}

  private get runnerUrl(): string {
    return process.env.RUNNER_URL || 'http://localhost:28003'
  }

  private get runnerKey(): string {
    return process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
  }

  /**
   * 자연어 수정문 → 새 args (LLM) 변환을 runner 에 위임.
   * DB / deepagents 상태는 건드리지 않는다 — 사용자에게 한 번 더 확인시키기 위한 사전 계산.
   */
  async previewEdit(interactionId: string, editPrompt: string) {
    const res = await fetch(
      `${this.runnerUrl}/api/v1/hitl/interactions/${interactionId}/preview-edit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.runnerKey,
        },
        body: JSON.stringify({ editPrompt }),
      },
    )
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ message: 'Runner request failed' }))
      throw new HttpException(
        err.detail || err.message || 'Runner request failed',
        res.status >= 500 ? 502 : res.status,
      )
    }
    return res.json() as Promise<{
      name: string
      args: Record<string, unknown>
      originalArgs: Record<string, unknown>
      taskDescriptionUpdate?: string | null
      originalTaskDescription?: string | null
    }>
  }

  async listPending(projectId: string) {
    return this.prisma.humanInteraction.findMany({
      where: {
        status: 'pending',
        thread: { projectId },
      },
      include: {
        thread: {
          select: {
            id: true,
            title: true,
            agentId: true,
            teamId: true,
            agent: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 특정 thread 의 HITL 상호작용을 status 무관하게 모두 조회 (히스토리 복원용).
   * createdAt 오름차순으로 반환. agent_context jsonb 안의 deepagents 필드
   * (actionRequests / reviewConfigs / toolName / toolArgs / allowedDecisions) 를
   * top-level 로 끌어올려 WS 이벤트 (`hitl.request`) 와 동일한 모양으로 노출한다.
   */
  async listByThread(threadId: string) {
    const rows = await this.prisma.humanInteraction.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => {
      const ctx = (row.agentContext ?? {}) as Record<string, unknown>
      const actionRequests = (ctx.actionRequests as Array<{ name: string; args: Record<string, unknown> }> | undefined) ?? []
      const reviewConfigs = (ctx.reviewConfigs as Array<{ actionName: string; allowedDecisions: string[] }> | undefined) ?? []
      const primary = actionRequests[0]
      const toolName = primary?.name
      const toolArgs = primary?.args
      const allowedDecisions = toolName
        ? reviewConfigs.find((c) => c.actionName === toolName)?.allowedDecisions
        : undefined
      const responseObj = (row.response ?? null) as Record<string, unknown> | null
      const editPrompt =
        responseObj && typeof responseObj.editPrompt === 'string'
          ? (responseObj.editPrompt as string)
          : undefined
      const editedActionRaw =
        responseObj && typeof responseObj === 'object' && responseObj
          ? ((responseObj as { editedAction?: unknown }).editedAction as
              | { name?: string; args?: Record<string, unknown> }
              | undefined)
          : undefined
      const editedAction =
        editedActionRaw && typeof editedActionRaw === 'object'
          ? {
              name: typeof editedActionRaw.name === 'string' ? editedActionRaw.name : toolName,
              args:
                editedActionRaw.args && typeof editedActionRaw.args === 'object'
                  ? (editedActionRaw.args as Record<string, unknown>)
                  : {},
            }
          : undefined
      return {
        ...row,
        actionRequests,
        reviewConfigs,
        toolName,
        toolArgs,
        allowedDecisions,
        editPrompt,
        editedAction,
      }
    })
  }

  async get(interactionId: string) {
    const interaction = await this.prisma.humanInteraction.findUnique({
      where: { id: interactionId },
      include: {
        thread: {
          select: {
            id: true,
            title: true,
            projectId: true,
            agentId: true,
            teamId: true,
            agent: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    })
    if (!interaction) throw new NotFoundException(`Interaction not found: ${interactionId}`)
    return interaction
  }

  /**
   * 응답 기록 (실제 에이전트 재개는 agent-runner에서 WS 이벤트로 처리).
   *
   * source 는 자격증명 소스 분기용. NestJS 측에서는 DB 업데이트만 하고 deepagents 재개는
   * agent-runner WS 게이트웨이(`hitl.respond`)가 처리하므로, 실제 자격증명 분기는 WS 이벤트의
   * source 필드(클라이언트에서 직접 전달)가 결정한다. NestJS 의 source 파라미터는 호환·로깅용.
   */
  async respond(
    interactionId: string,
    response: unknown,
    respondedBy: string,
    source?: 'studio' | 'client',
  ) {
    void source
    const interaction = await this.get(interactionId)
    if (interaction.status !== 'pending') {
      throw new Error(`Interaction is not pending: ${interaction.status}`)
    }

    return this.prisma.humanInteraction.update({
      where: { id: interactionId },
      data: {
        status: interaction.type === 'approval'
          ? (response === true || response === 'approved' ? 'approved' : 'rejected')
          : 'approved',
        response: response as object,
        respondedBy,
        respondedAt: new Date(),
      },
    })
  }

  async escalate(interactionId: string, escalateTo: string) {
    await this.get(interactionId)
    return this.prisma.humanInteraction.update({
      where: { id: interactionId },
      data: { escalateTo },
    })
  }
}
