import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TOOL_CREDENTIAL_MAP } from './tool-credential-map'
import { getBuiltinToolDef } from '../tools/builtin-catalog'

interface McpToolRef {
  serverId: string
  toolName: string
}

interface SubAgentNodeData {
  agentName?: string
  role?: string
  modelName?: string
  builtinToolIds?: string[]
  toolIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: McpToolRef[]
  skillIds?: string[]
}

interface GraphDefinition {
  nodes?: Array<{ id: string; data?: SubAgentNodeData }>
}

interface AgentSnapshot {
  modelId?: string
  architecture?: string
  toolIds?: string[]
  builtinToolIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: McpToolRef[]
  skillIds?: string[]
  graphDefinition?: GraphDefinition
  config?: Record<string, unknown> & { starters?: string[] }
}

interface DeploymentRow {
  id: string
  agentId: string
  version: number
  publicPath: string
  deployedAt: Date
  snapshot: unknown
  agent: {
    id: string
    slug: string
    name: string
    description: string
    type: string
  }
  env: { id: string; name: string; slug: string; color: string }
}

export interface RequiredCredentialDto {
  kind: 'provider' | 'tool' | 'mcp'
  targetId: string
  label: string
  reason: string
}

export interface SkillRefDto {
  id: string
  name: string
  description?: string
}

export interface ToolRefDto {
  kind: 'builtin' | 'custom' | 'mcp'
  id: string
  label: string
  description?: string
  mcpServerId?: string
  mcpServerName?: string
  credentialMode?: 'shared' | 'per_user'
  requiresCredential: boolean
  credentialTargetId?: string
}

export interface SubAgentRefDto {
  id: string
  name: string
  role?: string
  modelName?: string
  skills: SkillRefDto[]
  tools: ToolRefDto[]
}

export interface AgentCompositionDto {
  main: { skills: SkillRefDto[]; tools: ToolRefDto[] }
  subAgents: SubAgentRefDto[]
}

interface McpToolMeta {
  name: string
  description?: string
}

interface McpServerLookup {
  id: string
  name: string
  tools: McpToolMeta[]
  exposedTools: string[]
  credentialMode: 'shared' | 'per_user'
}

interface CompositionLookups {
  customTools: Map<string, { id: string; name: string; description: string | null }>
  mcpServers: Map<string, McpServerLookup>
  skills: Map<string, { id: string; name: string; description: string }>
}

@Injectable()
export class ClientAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser() {
    const deployments = await this.prisma.agentDeployment.findMany({
      where: { status: 'active' },
      include: {
        agent: { select: { id: true, slug: true, name: true, description: true, type: true } },
        env: { select: { id: true, name: true, slug: true, color: true } },
      },
      orderBy: { deployedAt: 'desc' },
    })

    const rows = deployments as DeploymentRow[]
    const lookups = await this.buildLookupsForSnapshots(rows.map((d) => d.snapshot))
    return rows.map((d) => this.toCardSummary(d, lookups))
  }

  async getBySlug(userId: string, slug: string) {
    const deployment = await this.prisma.agentDeployment.findFirst({
      where: { status: 'active', agent: { slug } },
      include: {
        agent: { select: { id: true, slug: true, name: true, description: true, type: true } },
        env: { select: { id: true, name: true, slug: true, color: true } },
      },
      orderBy: { deployedAt: 'desc' },
    })
    if (!deployment) throw new NotFoundException(`Deployed agent not found: ${slug}`)

    const row = deployment as DeploymentRow
    const lookups = await this.buildLookupsForSnapshots([row.snapshot])
    const card = this.toCardSummary(row, lookups)
    const required = await this.deriveRequiredCredentials(row.snapshot, lookups)
    const have = await this.collectUserCredentialKeys(userId)
    const missing = required.filter((r) => !have.has(`${r.kind}:${r.targetId}`))

    return { ...card, requiredCredentials: required, missingCredentials: missing }
  }

  // ----------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------

  private toCardSummary(d: DeploymentRow, lookups: CompositionLookups) {
    const snap = (d.snapshot ?? {}) as AgentSnapshot
    const starters = Array.isArray(snap.config?.starters) ? (snap.config?.starters as string[]) : []
    return {
      deploymentId: d.id,
      agentId: d.agent.id,
      slug: d.agent.slug,
      name: d.agent.name,
      description: d.agent.description,
      type: d.agent.type,
      architecture: snap.architecture ?? 'react',
      env: d.env,
      version: d.version,
      publicPath: d.publicPath,
      starters,
      deployedAt: d.deployedAt.toISOString(),
      composition: this.resolveComposition(snap, lookups),
    }
  }

  private async collectUserCredentialKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userCredential.findMany({
      where: { userId, status: 'active' },
      select: { kind: true, targetId: true },
    })
    return new Set(rows.map((r) => `${r.kind}:${r.targetId}`))
  }

  // --- 합집합 lookup -----------------------------------------------

  private async buildLookupsForSnapshots(snapshots: unknown[]): Promise<CompositionLookups> {
    const toolIds = new Set<string>()
    const mcpIds = new Set<string>()
    const skillIds = new Set<string>()

    for (const raw of snapshots) {
      const snap = (raw ?? {}) as AgentSnapshot
      this.collectAgentIds(snap, toolIds, mcpIds, skillIds)
      for (const node of snap.graphDefinition?.nodes ?? []) {
        this.collectAgentIds(node.data ?? {}, toolIds, mcpIds, skillIds)
      }
    }

    const [customTools, mcpServers, skills] = await Promise.all([
      toolIds.size > 0
        ? this.prisma.tool.findMany({
            where: { id: { in: Array.from(toolIds) } },
            select: { id: true, name: true, description: true },
          })
        : Promise.resolve([] as { id: string; name: string; description: string | null }[]),
      mcpIds.size > 0
        ? this.prisma.mcpServer.findMany({
            where: { id: { in: Array.from(mcpIds) } },
            select: {
              id: true,
              name: true,
              tools: true,
              exposedTools: true,
              credentialMode: true,
            },
          })
        : Promise.resolve(
            [] as {
              id: string
              name: string
              tools: unknown
              exposedTools: string[]
              credentialMode: string
            }[],
          ),
      skillIds.size > 0
        ? this.prisma.skill.findMany({
            where: { id: { in: Array.from(skillIds) } },
            select: { id: true, name: true, description: true },
          })
        : Promise.resolve([] as { id: string; name: string; description: string }[]),
    ])

    return {
      customTools: new Map(customTools.map((t) => [t.id, t])),
      mcpServers: new Map(
        mcpServers.map((m) => [
          m.id,
          {
            id: m.id,
            name: m.name,
            tools: ((m.tools as McpToolMeta[] | null) ?? []) as McpToolMeta[],
            exposedTools: m.exposedTools,
            credentialMode: (m.credentialMode === 'per_user' ? 'per_user' : 'shared') as
              | 'shared'
              | 'per_user',
          },
        ]),
      ),
      skills: new Map(skills.map((s) => [s.id, s])),
    }
  }

  private collectAgentIds(
    src: SubAgentNodeData | AgentSnapshot,
    toolIds: Set<string>,
    mcpIds: Set<string>,
    skillIds: Set<string>,
  ) {
    for (const id of src.toolIds ?? []) toolIds.add(id)
    for (const id of src.mcpServerIds ?? []) mcpIds.add(id)
    for (const ref of src.mcpToolRefs ?? []) mcpIds.add(ref.serverId)
    for (const id of src.skillIds ?? []) skillIds.add(id)
  }

  // --- composition resolve -----------------------------------------

  private resolveComposition(
    snap: AgentSnapshot,
    lookups: CompositionLookups,
  ): AgentCompositionDto {
    const main = {
      skills: this.resolveSkills(snap.skillIds ?? [], lookups),
      tools: this.resolveTools(snap, lookups),
    }

    const subAgents: SubAgentRefDto[] = []
    for (const node of snap.graphDefinition?.nodes ?? []) {
      const data = node.data ?? {}
      const name = data.agentName?.trim() || 'Sub Agent'
      subAgents.push({
        id: node.id,
        name,
        role: data.role,
        modelName: data.modelName,
        skills: this.resolveSkills(data.skillIds ?? [], lookups),
        tools: this.resolveTools(data, lookups),
      })
    }

    return { main, subAgents }
  }

  private resolveSkills(ids: string[], lookups: CompositionLookups): SkillRefDto[] {
    const out: SkillRefDto[] = []
    for (const id of ids) {
      const row = lookups.skills.get(id)
      if (!row) continue
      out.push({
        id: row.id,
        name: row.name,
        description: row.description || undefined,
      })
    }
    return out
  }

  private resolveTools(
    src: SubAgentNodeData | AgentSnapshot,
    lookups: CompositionLookups,
  ): ToolRefDto[] {
    const out: ToolRefDto[] = []

    // built-in
    for (const slug of src.builtinToolIds ?? []) {
      const def = getBuiltinToolDef(slug)
      const cred = TOOL_CREDENTIAL_MAP[slug]
      out.push({
        kind: 'builtin',
        id: slug,
        label: def?.name ?? slug,
        description: def?.description,
        requiresCredential: !!cred,
        credentialTargetId: cred?.targetId,
      })
    }

    // custom tool
    for (const id of src.toolIds ?? []) {
      const row = lookups.customTools.get(id)
      if (!row) continue
      out.push({
        kind: 'custom',
        id: row.id,
        label: row.name,
        description: row.description || undefined,
        requiresCredential: false,
      })
    }

    // mcp tools — mcpToolRefs 우선, 없으면 mcpServerIds + exposedTools
    const refsByServer = new Map<string, Set<string>>()
    for (const ref of src.mcpToolRefs ?? []) {
      if (!refsByServer.has(ref.serverId)) refsByServer.set(ref.serverId, new Set())
      refsByServer.get(ref.serverId)!.add(ref.toolName)
    }

    const handledServerIds = new Set<string>()
    for (const [serverId, toolNames] of refsByServer.entries()) {
      const server = lookups.mcpServers.get(serverId)
      if (!server) continue
      handledServerIds.add(serverId)
      for (const toolName of toolNames) {
        const meta = server.tools.find((t) => t.name === toolName)
        out.push(this.makeMcpToolRef(server, toolName, meta?.description))
      }
    }

    for (const serverId of src.mcpServerIds ?? []) {
      if (handledServerIds.has(serverId)) continue
      const server = lookups.mcpServers.get(serverId)
      if (!server) continue
      const allow =
        server.exposedTools.length > 0 ? new Set(server.exposedTools) : null
      for (const tool of server.tools) {
        if (allow && !allow.has(tool.name)) continue
        out.push(this.makeMcpToolRef(server, tool.name, tool.description))
      }
    }

    return out
  }

  private makeMcpToolRef(
    server: McpServerLookup,
    toolName: string,
    description?: string,
  ): ToolRefDto {
    return {
      kind: 'mcp',
      id: `${server.id}:${toolName}`,
      label: toolName,
      description,
      mcpServerId: server.id,
      mcpServerName: server.name,
      credentialMode: server.credentialMode,
      requiresCredential: server.credentialMode === 'per_user',
      credentialTargetId:
        server.credentialMode === 'per_user' ? server.id : undefined,
    }
  }

  // --- required credentials (기존 로직, lookups 재사용) -------------

  private async deriveRequiredCredentials(
    snapshot: unknown,
    lookups: CompositionLookups,
  ): Promise<RequiredCredentialDto[]> {
    const snap = (snapshot ?? {}) as AgentSnapshot
    const required: RequiredCredentialDto[] = []

    if (snap.modelId) {
      const model = await this.prisma.model.findUnique({
        where: { id: snap.modelId },
        select: {
          modelId: true,
          provider: { select: { slug: true, name: true } },
        },
      })
      if (model?.provider) {
        required.push({
          kind: 'provider',
          targetId: model.provider.slug,
          label: model.provider.name,
          reason: `모델 ${model.modelId} 호출용`,
        })
      }
    }

    const mcpIds = new Set<string>()
    for (const id of snap.mcpServerIds ?? []) mcpIds.add(id)
    for (const ref of snap.mcpToolRefs ?? []) mcpIds.add(ref.serverId)
    for (const node of snap.graphDefinition?.nodes ?? []) {
      const data = node.data ?? {}
      for (const id of data.mcpServerIds ?? []) mcpIds.add(id)
      for (const ref of data.mcpToolRefs ?? []) mcpIds.add(ref.serverId)
    }

    for (const id of mcpIds) {
      const server = lookups.mcpServers.get(id)
      if (!server) continue
      if (server.credentialMode !== 'per_user') continue
      required.push({
        kind: 'mcp',
        targetId: server.id,
        label: server.name,
        reason: 'MCP 서버 인증',
      })
    }

    // builtin — 매핑 사전 lookup, targetId 단위 dedup
    const builtinIds = new Set<string>()
    for (const id of snap.builtinToolIds ?? []) builtinIds.add(id)
    for (const node of snap.graphDefinition?.nodes ?? []) {
      for (const id of node.data?.builtinToolIds ?? []) builtinIds.add(id)
    }

    const toolByTarget = new Map<string, RequiredCredentialDto>()
    for (const slug of builtinIds) {
      const entry = TOOL_CREDENTIAL_MAP[slug]
      if (!entry) continue
      if (toolByTarget.has(entry.targetId)) continue
      toolByTarget.set(entry.targetId, {
        kind: 'tool',
        targetId: entry.targetId,
        label: entry.label,
        reason: entry.reason,
      })
    }
    for (const dto of toolByTarget.values()) required.push(dto)

    return required
  }
}
