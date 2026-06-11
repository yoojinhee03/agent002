import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateAgentRequest, UpdateAgentRequest } from '@agent-studio/shared'

/**
 * 신규 agent 가 자동으로 받는 builtin 도구 목록.
 * - `current_time`: 자격증명 불필요·비용 0·LLM 학습 cutoff 보완 (시간 추론 정확도).
 *   대부분의 시나리오에서 잠재적 유용 → default 활성화 (사용자가 끄고 싶으면 settings 에서
 *   builtinToolIds 에서 제거 가능).
 */
const DEFAULT_BUILTIN_TOOL_IDS = ['current_time']

function mergeDefaultBuiltins(provided: string[] | undefined): string[] {
  const incoming = provided ?? []
  const merged = new Set<string>([...DEFAULT_BUILTIN_TOOL_IDS, ...incoming])
  return Array.from(merged)
}

const VALID_POLICIES = new Set(['auto', 'requires_approval', 'restricted', 'disabled'])

export interface NormalizedToolPermissionEntry {
  policy: string
  cardId?: string
  conditions?: string
}

/**
 * toolPermissions 를 항상 object 형태 ({policy, cardId?, conditions?}) 로 정규화한다.
 * 기존 string 형태 ({toolName: "requires_approval"}) 도 받아들여 {policy: ...} 로 승격.
 * cardId 는 policy='requires_approval' 일 때만 유지 (그 외 정책에서는 의미 없음).
 */
function normalizeToolPermissions(
  input: unknown,
): Record<string, NormalizedToolPermissionEntry> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const out: Record<string, NormalizedToolPermissionEntry> = {}
  for (const [toolId, raw] of Object.entries(input as Record<string, unknown>)) {
    let policy: string | undefined
    let cardId: string | undefined
    let conditions: string | undefined

    if (typeof raw === 'string') {
      policy = raw
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      if (typeof obj.policy === 'string') policy = obj.policy
      if (typeof obj.cardId === 'string' && obj.cardId.length > 0) cardId = obj.cardId
      if (typeof obj.conditions === 'string' && obj.conditions.length > 0) conditions = obj.conditions
    }

    if (!policy || !VALID_POLICIES.has(policy)) continue

    const entry: NormalizedToolPermissionEntry = { policy }
    if (policy === 'requires_approval' && cardId) entry.cardId = cardId
    if (policy === 'restricted' && conditions) entry.conditions = conditions
    out[toolId] = entry
  }
  return out
}

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * dto 본체 + graphDefinition.nodes[].config.skillIds(또는 skill_ids)를 모아
   * 모두 해당 사용자가 소유한 Skill인지 검증한다.
   */
  private async validateSkillOwnership(
    userId: string,
    dto: { skillIds?: string[]; graphDefinition?: Record<string, unknown> },
  ): Promise<void> {
    const collected = new Set<string>()
    for (const id of dto.skillIds ?? []) collected.add(id)

    const graph = dto.graphDefinition as { nodes?: unknown[] } | undefined
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as Array<Record<string, unknown>>) : []
    for (const node of nodes) {
      const config = (node?.config ?? node?.data) as Record<string, unknown> | undefined
      const ids = (config?.skillIds ?? config?.skill_ids) as unknown
      if (Array.isArray(ids)) {
        for (const id of ids) if (typeof id === 'string') collected.add(id)
      }
    }

    if (collected.size === 0) return

    const owned = await this.prisma.skill.findMany({
      where: { id: { in: [...collected] }, userId },
      select: { id: true },
    })
    const ownedSet = new Set(owned.map((s) => s.id))
    const invalid = [...collected].filter((id) => !ownedSet.has(id))
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Skill 소유자가 아니거나 존재하지 않는 ID입니다: ${invalid.join(', ')}`,
      )
    }
  }

  /**
   * 슬러그 후보(없으면 이름)에서 a-z/0-9/하이픈만 남기고, 비어 있으면 'agent'를 사용.
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
    const baseSlug = fromCandidate || normalize(name) || 'agent'

    let slug = baseSlug
    let suffix = 2
    while (true) {
      const conflict = await this.prisma.agent.findUnique({
        where: { projectId_slug: { projectId, slug } },
      })
      if (!conflict) return slug
      slug = `${baseSlug}-${suffix++}`
    }
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

  async create(projectIdOrSlug: string, userId: string, dto: CreateAgentRequest) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)

    await this.validateSkillOwnership(userId, dto)

    const slug = await this.resolveUniqueSlug(projectId, dto.slug, dto.name)

    return this.prisma.agent.create({
      data: {
        projectId,
        name: dto.name,
        slug,
        description: dto.description || '',
        type: dto.type || 'single',
        architecture: dto.architecture || 'react',
        systemPrompt: dto.systemPrompt,
        modelId: dto.modelId,
        toolIds: dto.toolIds || [],
        toolGroupIds: dto.toolGroupIds || [],
        mcpServerIds: dto.mcpServerIds || [],
        mcpToolRefs: (dto.mcpToolRefs as object[] ?? undefined) || undefined,
        builtinToolIds: mergeDefaultBuiltins(dto.builtinToolIds),
        skillIds: dto.skillIds || [],
        graphDefinition: dto.graphDefinition as object ?? undefined,
        config: (dto.config as object) || {},
        hitlPolicy: dto.hitlPolicy as object ?? undefined,
        toolPermissions: (normalizeToolPermissions(dto.toolPermissions) as object) ?? undefined,
      },
    })
  }

  async list(projectIdOrSlug: string) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    const agents = await this.prisma.agent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            deployments: { where: { status: 'active' } },
          },
        },
      },
    })
    return agents.map((a) => {
      const { _count, ...rest } = a
      return {
        ...rest,
        toolPermissions: normalizeToolPermissions(rest.toolPermissions) ?? null,
        hasActiveDeployment: (_count?.deployments ?? 0) > 0,
      }
    })
  }

  async get(agentId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) throw new NotFoundException(`Agent not found: ${agentId}`)
    return {
      ...agent,
      toolPermissions: normalizeToolPermissions(agent.toolPermissions) ?? null,
    }
  }

  async update(agentId: string, userId: string, dto: UpdateAgentRequest) {
    await this.get(agentId) // 존재 확인
    await this.validateSkillOwnership(userId, dto)
    return this.prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.architecture !== undefined && { architecture: dto.architecture }),
        ...(dto.systemPrompt !== undefined && { systemPrompt: dto.systemPrompt }),
        ...(dto.modelId !== undefined && { modelId: dto.modelId }),
        ...(dto.toolIds !== undefined && { toolIds: dto.toolIds }),
        ...(dto.toolGroupIds !== undefined && { toolGroupIds: dto.toolGroupIds }),
        ...(dto.mcpServerIds !== undefined && { mcpServerIds: dto.mcpServerIds }),
        ...(dto.mcpToolRefs !== undefined && { mcpToolRefs: dto.mcpToolRefs as object[] }),
        ...(dto.builtinToolIds !== undefined && { builtinToolIds: dto.builtinToolIds }),
        ...(dto.skillIds !== undefined && { skillIds: dto.skillIds }),
        ...(dto.graphDefinition !== undefined && { graphDefinition: dto.graphDefinition as object }),
        ...(dto.config !== undefined && { config: dto.config as object }),
        ...(dto.hitlPolicy !== undefined && { hitlPolicy: dto.hitlPolicy as object }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.reasoningConfig !== undefined && { reasoningConfig: dto.reasoningConfig as object }),
        ...(dto.memoryConfig !== undefined && { memoryConfig: dto.memoryConfig as object }),
        ...(dto.guardrailsConfig !== undefined && { guardrailsConfig: dto.guardrailsConfig as object }),
        ...(dto.planningConfig !== undefined && { planningConfig: dto.planningConfig as object }),
        ...(dto.outputSchema !== undefined && { outputSchema: dto.outputSchema as object }),
        ...(dto.toolPermissions !== undefined && {
          toolPermissions: (normalizeToolPermissions(dto.toolPermissions) ?? {}) as object,
        }),
      },
    })
  }

  async delete(agentId: string) {
    await this.get(agentId)
    return this.prisma.agent.delete({ where: { id: agentId } })
  }

  async listPromptVersions(agentId: string) {
    await this.get(agentId)
    return this.prisma.promptVersion.findMany({
      where: { agentId },
      orderBy: { version: 'desc' },
    })
  }

  async createPromptVersion(agentId: string, dto: { systemPrompt: string; label?: string; createdBy?: string }) {
    await this.get(agentId)
    const latest = await this.prisma.promptVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
    })
    return this.prisma.promptVersion.create({
      data: {
        agentId,
        systemPrompt: dto.systemPrompt,
        version: (latest?.version ?? 0) + 1,
        snapshot: dto.systemPrompt, // Required field
        createdBy: dto.createdBy,
      },
    })
  }

  async clone(agentId: string) {
    const source = await this.get(agentId)
    const clonedName = `${source.name} (복사본)`
    const baseSlug = `${source.slug}-copy`
    let slug = baseSlug
    let suffix = 1
    while (true) {
      const conflict = await this.prisma.agent.findUnique({
        where: { projectId_slug: { projectId: source.projectId, slug } },
      })
      if (!conflict) break
      slug = `${baseSlug}-${suffix++}`
    }
    return this.prisma.agent.create({
      data: {
        projectId: source.projectId,
        name: clonedName,
        slug,
        description: source.description,
        type: source.type,
        architecture: source.architecture,
        systemPrompt: source.systemPrompt,
        modelId: source.modelId,
        toolIds: source.toolIds,
        toolGroupIds: source.toolGroupIds,
        mcpServerIds: source.mcpServerIds,
        mcpToolRefs: source.mcpToolRefs as object[] ?? undefined,
        builtinToolIds: source.builtinToolIds,
        skillIds: source.skillIds,
        graphDefinition: source.graphDefinition as object ?? undefined,
        config: source.config as object,
        hitlPolicy: source.hitlPolicy as object ?? undefined,
        reasoningConfig: source.reasoningConfig as object ?? undefined,
        memoryConfig: source.memoryConfig as object ?? undefined,
        guardrailsConfig: source.guardrailsConfig as object ?? undefined,
        planningConfig: source.planningConfig as object ?? undefined,
        outputSchema: source.outputSchema as object ?? undefined,
        toolPermissions: (normalizeToolPermissions(source.toolPermissions) as object) ?? undefined,
      },
    })
  }

  async exportAgent(agentId: string): Promise<Record<string, unknown>> {
    const agent = await this.get(agentId)
    return {
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      type: agent.type,
      architecture: agent.architecture,
      systemPrompt: agent.systemPrompt,
      modelId: agent.modelId,
      toolIds: agent.toolIds,
      toolGroupIds: agent.toolGroupIds,
      mcpServerIds: agent.mcpServerIds,
      mcpToolRefs: agent.mcpToolRefs,
      builtinToolIds: agent.builtinToolIds,
      skillIds: agent.skillIds,
      graphDefinition: agent.graphDefinition,
      config: agent.config,
      hitlPolicy: agent.hitlPolicy,
      reasoningConfig: agent.reasoningConfig,
      memoryConfig: agent.memoryConfig,
      guardrailsConfig: agent.guardrailsConfig,
      planningConfig: agent.planningConfig,
      outputSchema: agent.outputSchema,
      toolPermissions: agent.toolPermissions,
      exportedAt: new Date().toISOString(),
    }
  }

  async importAgent(projectIdOrSlug: string, data: Record<string, unknown>) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    const name = typeof data.name === 'string' ? data.name : 'Imported Agent'
    const candidate = typeof data.slug === 'string' ? data.slug : undefined
    const slug = await this.resolveUniqueSlug(projectId, candidate, name)
    return this.prisma.agent.create({
      data: {
        projectId,
        name,
        slug,
        description: typeof data.description === 'string' ? data.description : '',
        type: ((data.type as string) || 'single') as import('@prisma/client').AgentType,
        architecture: ((data.architecture as string) || 'react') as import('@prisma/client').AgentArchitecture,
        systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
        modelId: typeof data.modelId === 'string' ? data.modelId : 'gpt-4o-mini',
        toolIds: Array.isArray(data.toolIds) ? (data.toolIds as string[]) : [],
        toolGroupIds: Array.isArray(data.toolGroupIds) ? (data.toolGroupIds as string[]) : [],
        mcpServerIds: Array.isArray(data.mcpServerIds) ? (data.mcpServerIds as string[]) : [],
        mcpToolRefs: Array.isArray(data.mcpToolRefs) ? (data.mcpToolRefs as object[]) : undefined,
        builtinToolIds: Array.isArray(data.builtinToolIds) ? (data.builtinToolIds as string[]) : [],
        skillIds: Array.isArray(data.skillIds) ? (data.skillIds as string[]) : [],
        graphDefinition: (data.graphDefinition as object) ?? undefined,
        config: (data.config as object) || {},
        hitlPolicy: (data.hitlPolicy as object) ?? undefined,
        reasoningConfig: (data.reasoningConfig as object) ?? undefined,
        memoryConfig: (data.memoryConfig as object) ?? undefined,
        guardrailsConfig: (data.guardrailsConfig as object) ?? undefined,
        planningConfig: (data.planningConfig as object) ?? undefined,
        outputSchema: (data.outputSchema as object) ?? undefined,
        toolPermissions: (normalizeToolPermissions(data.toolPermissions) as object) ?? undefined,
      },
    })
  }

  async listSchedules(agentId: string): Promise<unknown[]> {
    const agent = await this.get(agentId)
    const config = agent.config as Record<string, unknown>
    const tasks = config?.scheduledTasks
    return Array.isArray(tasks) ? tasks : []
  }

  async createSchedule(agentId: string, dto: {
    name: string
    cron: string
    input: Record<string, unknown>
    enabled?: boolean
  }): Promise<unknown> {
    const agent = await this.get(agentId)
    const config = agent.config as Record<string, unknown>
    const tasks: unknown[] = Array.isArray(config?.scheduledTasks) ? (config.scheduledTasks as unknown[]) : []
    const newTask = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: dto.name,
      cron: dto.cron,
      input: dto.input,
      enabled: dto.enabled ?? true,
      lastRunAt: null,
      createdAt: new Date().toISOString(),
    }
    const updated = [...tasks, newTask]
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { config: { ...config, scheduledTasks: updated as object[] } },
    })
    return newTask
  }

  async deleteSchedule(agentId: string, scheduleId: string): Promise<void> {
    const agent = await this.get(agentId)
    const config = agent.config as Record<string, unknown>
    const tasks: unknown[] = Array.isArray(config?.scheduledTasks) ? (config.scheduledTasks as unknown[]) : []
    const updated = tasks.filter((t) => (t as Record<string, unknown>).id !== scheduleId)
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { config: { ...config, scheduledTasks: updated as object[] } },
    })
  }

  async runSchedule(agentId: string, scheduleId: string): Promise<{ triggered: boolean }> {
    const agent = await this.get(agentId)
    const config = agent.config as Record<string, unknown>
    const tasks: unknown[] = Array.isArray(config?.scheduledTasks) ? (config.scheduledTasks as unknown[]) : []
    const task = tasks.find((t) => (t as Record<string, unknown>).id === scheduleId)
    if (!task) throw new NotFoundException(`Schedule not found: ${scheduleId}`)
    const updated = tasks.map((t) => {
      const item = t as Record<string, unknown>
      if (item.id === scheduleId) return { ...item, lastRunAt: new Date().toISOString() }
      return t
    })
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { config: { ...config, scheduledTasks: updated as object[] } },
    })
    return { triggered: true }
  }

  async compare(agentAId: string, agentBId: string, message: string): Promise<{
    a: { output: string; latency: number; tokens: number }
    b: { output: string; latency: number; tokens: number }
  }> {
    const [agentA, agentB] = await Promise.all([
      this.get(agentAId),
      this.get(agentBId),
    ])

    const run = async (agent: typeof agentA) => {
      const start = Date.now()
      try {
        // stub 실행 — 실제 LangGraph 호출은 agent-runner에서 담당
        const output = `[${agent.name}] ${message.substring(0, 50)}... (stub response)`
        return { output, latency: Date.now() - start, tokens: Math.floor(Math.random() * 300) + 100 }
      } catch (err) {
        return {
          output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          latency: Date.now() - start,
          tokens: 0,
        }
      }
    }

    const [a, b] = await Promise.all([run(agentA), run(agentB)])
    return { a, b }
  }
}
