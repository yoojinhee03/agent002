import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateMcpServerDto } from './dto/create-mcp-server.dto'
import { UpdateMcpServerDto } from './dto/update-mcp-server.dto'
import type {
  McpServerConfig,
  McpTool,
  McpTransport,
} from '@agent-studio/shared'

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name)

  constructor(private prisma: PrismaService) {}

  private get runnerUrl(): string {
    return process.env.RUNNER_URL || 'http://localhost:28003'
  }

  private get runnerKey(): string {
    return process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
  }

  /**
   * Runner 의 /api/v1/mcp/list-tools 를 호출해 도구 메타(name/description/inputSchema) 목록을
   * 가져온다. backend 는 MCP 클라이언트를 직접 띄우지 않으므로 도구 메타 갱신은 runner 위임.
   * 실패하면 빈 배열을 반환하고 caller 가 상태를 결정한다.
   */
  private async fetchToolsFromRunner(
    transport: McpTransport,
    config: McpServerConfig,
  ): Promise<{ tools: McpTool[]; error: string | null }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(`${this.runnerUrl}/api/v1/mcp/list-tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.runnerKey,
        },
        body: JSON.stringify({
          transport,
          command: config.command,
          args: config.args ?? [],
          env: config.env ?? {},
          url: config.url,
          headers: config.headers ?? {},
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const detail = await res.text()
        return { tools: [], error: `runner ${res.status}: ${detail.slice(0, 300)}` }
      }
      const json = (await res.json()) as { tools?: McpTool[] }
      return { tools: json.tools ?? [], error: null }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { tools: [], error: msg }
    } finally {
      clearTimeout(timer)
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

  async list(projectIdOrSlug: string) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    return this.prisma.mcpServer.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async getById(id: string) {
    const server = await this.prisma.mcpServer.findUnique({ where: { id } })
    if (!server) throw new NotFoundException(`MCP Server not found: ${id}`)
    return server
  }

  async create(projectIdOrSlug: string, dto: CreateMcpServerDto) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    return this.prisma.mcpServer.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        transport: dto.transport,
        config: dto.config as object,
        status: 'disconnected',
        ...(dto.credentialMode !== undefined && { credentialMode: dto.credentialMode }),
        ...(dto.requiredUserFields !== undefined && {
          requiredUserFields: dto.requiredUserFields as unknown as object,
        }),
        ...(dto.exposedTools !== undefined && { exposedTools: dto.exposedTools }),
      },
    })
  }

  async update(id: string, dto: UpdateMcpServerDto) {
    await this.getById(id)
    return this.prisma.mcpServer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.transport !== undefined && { transport: dto.transport }),
        ...(dto.config !== undefined && { config: dto.config as object }),
        ...(dto.credentialMode !== undefined && { credentialMode: dto.credentialMode }),
        ...(dto.requiredUserFields !== undefined && {
          requiredUserFields: dto.requiredUserFields as unknown as object,
        }),
        ...(dto.exposedTools !== undefined && { exposedTools: dto.exposedTools }),
      },
    })
  }

  async delete(id: string) {
    await this.getById(id)
    await this.prisma.mcpServer.delete({ where: { id } })
    return { success: true }
  }

  async connect(id: string) {
    const server = await this.getById(id)

    await this.prisma.mcpServer.update({
      where: { id },
      data: { status: 'connecting' },
    })

    const { tools, error } = await this.fetchToolsFromRunner(
      server.transport as McpTransport,
      (server.config as McpServerConfig | null) ?? {},
    )

    if (error) {
      this.logger.warn(`MCP connect/list-tools failed [id=${id}]: ${error}`)
      return this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'error' },
      })
    }

    const currentExposedTools = server.exposedTools as string[]
    const newToolNames = tools.map((t) => t.name)
    const cleanedExposedTools = currentExposedTools.filter(
      (name) => name.startsWith('__') || newToolNames.includes(name),
    )

    return this.prisma.mcpServer.update({
      where: { id },
      data: {
        status: 'connected',
        tools: tools as unknown as object[],
        toolCount: tools.length,
        exposedTools: cleanedExposedTools,
      },
    })
  }

  async refreshTools(id: string) {
    const server = await this.getById(id)
    const { tools, error } = await this.fetchToolsFromRunner(
      server.transport as McpTransport,
      (server.config as McpServerConfig | null) ?? {},
    )
    if (error) {
      this.logger.warn(`MCP refreshTools failed [id=${id}]: ${error}`)
      return this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'error' },
      })
    }

    const currentExposedTools = server.exposedTools as string[]
    const newToolNames = tools.map((t) => t.name)
    const cleanedExposedTools = currentExposedTools.filter(
      (name) => name.startsWith('__') || newToolNames.includes(name),
    )

    return this.prisma.mcpServer.update({
      where: { id },
      data: {
        status: 'connected',
        tools: tools as unknown as object[],
        toolCount: tools.length,
        exposedTools: cleanedExposedTools,
      },
    })
  }

  async updateTools(id: string, tools: McpTool[]) {
    return this.prisma.mcpServer.update({
      where: { id },
      data: {
        tools: tools as unknown as object[],
        toolCount: tools.length,
        status: 'connected',
      },
    })
  }

  async disconnect(id: string) {
    return this.prisma.mcpServer.update({
      where: { id },
      data: { status: 'disconnected' },
    })
  }

  /**
   * 단일 도구 노출 토글.
   * - exposed=true: exposedTools 배열에 없으면 추가
   * - exposed=false: exposedTools 가 비어있으면 "전체 노출" 상태이므로
   *   현재 tools 전체 중 해당 toolName 만 빼고 나머지로 채운다.
   *   이미 exposedTools 가 있으면 해당 toolName 만 제거.
   */
  async toggleToolVisibility(id: string, toolName: string, exposed: boolean) {
    const server = await this.getById(id)
    const currentExposed = server.exposedTools as string[]

    let newExposed: string[]
    if (exposed) {
      newExposed = currentExposed.includes(toolName)
        ? currentExposed
        : [...currentExposed, toolName]
    } else {
      if (currentExposed.length === 0) {
        // 전체 노출 상태 → 해당 도구만 제외한 나머지를 명시적으로 채운다
        const allTools = ((server.tools as unknown as McpTool[]) ?? []).map((t) => t.name)
        newExposed = allTools.filter((name) => name !== toolName)
      } else {
        newExposed = currentExposed.filter((name) => name !== toolName)
      }
    }

    return this.prisma.mcpServer.update({
      where: { id },
      data: { exposedTools: newExposed },
    })
  }

  async listAllTools(projectIdOrSlug: string, onlyExposed = false) {
    const projectId = await this.resolveProjectId(projectIdOrSlug)
    const servers = await this.prisma.mcpServer.findMany({
      where: { projectId, status: 'connected' },
      select: {
        id: true,
        name: true,
        tools: true,
        status: true,
        exposedTools: true,
        credentialMode: true,
      },
    })

    const empties = servers.filter(
      (s) => !s.tools || (Array.isArray(s.tools) && (s.tools as unknown[]).length === 0),
    )
    if (empties.length > 0) {
      await Promise.all(
        empties.map((s) =>
          this.refreshTools(s.id).catch((e: unknown) => {
            this.logger.warn(
              `MCP backfill refreshTools failed [id=${s.id}]: ${e instanceof Error ? e.message : String(e)}`,
            )
            return null
          }),
        ),
      )

      const refreshed = await this.prisma.mcpServer.findMany({
        where: { projectId, status: 'connected' },
        select: {
          id: true,
          name: true,
          tools: true,
          status: true,
          exposedTools: true,
          credentialMode: true,
        },
      })
      return refreshed.map((s) => this.buildToolsEntry(s, onlyExposed))
    }

    return servers.map((s) => this.buildToolsEntry(s, onlyExposed))
  }

  private buildToolsEntry(
    server: {
      id: string
      name: string
      tools: unknown
      exposedTools: string[]
      credentialMode: string
    },
    onlyExposed: boolean,
  ) {
    const allTools = (server.tools as unknown as McpTool[]) ?? []
    const exposed = server.exposedTools as string[]

    let tools: McpTool[]
    if (onlyExposed && exposed.length > 0) {
      tools = allTools.filter((t) => exposed.includes(t.name))
    } else {
      tools = allTools
    }

    return {
      serverId: server.id,
      serverName: server.name,
      tools,
      exposedTools: exposed,
      credentialMode: server.credentialMode,
    }
  }
}
