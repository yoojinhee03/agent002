import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateAgentDeploymentDto } from './dto/create-agent-deployment.dto'
import { IssueDeploymentApiKeyDto } from './dto/issue-api-key.dto'

const DEFAULT_SCOPES = ['chat:invoke', 'chat:resume', 'chat:read']

@Injectable()
export class AgentDeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async deploy(agentId: string, userId: string, dto: CreateAgentDeploymentDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { project: true },
    })
    if (!agent) throw new NotFoundException(`Agent not found: ${agentId}`)

    const env = await this.prisma.deploymentEnvironment.findUnique({
      where: { id: dto.environmentId },
    })
    if (!env) throw new NotFoundException(`Environment not found: ${dto.environmentId}`)
    if (env.projectId !== agent.projectId) {
      throw new BadRequestException('Environment does not belong to the same project as the agent')
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.agentDeployment.updateMany({
        where: { agentId, environmentId: env.id, status: 'active' },
        data: { status: 'inactive', undeployedAt: new Date() },
      })

      const last = await tx.agentDeployment.findFirst({
        where: { agentId, environmentId: env.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const version = (last?.version ?? 0) + 1

      const publicPath = `/api/v1/agents/${agent.slug}/${env.slug}`
      const snapshot = this.buildSnapshot(agent)

      return tx.agentDeployment.create({
        data: {
          projectId: agent.projectId,
          agentId,
          environmentId: env.id,
          version,
          status: env.approvalRequired ? 'pending_approval' : 'active',
          publicPath,
          snapshot,
          description: dto.description ?? null,
          deployedBy: userId,
        },
      })
    })
  }

  async listByAgent(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    })
    if (!agent) throw new NotFoundException(`Agent not found: ${agentId}`)

    return this.prisma.agentDeployment.findMany({
      where: { agentId },
      include: { env: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: [{ environmentId: 'asc' }, { version: 'desc' }],
    })
  }

  async get(deploymentId: string) {
    const deployment = await this.prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
      include: {
        agent: { select: { id: true, name: true, slug: true } },
        env: { select: { id: true, name: true, slug: true, color: true } },
      },
    })
    if (!deployment) throw new NotFoundException(`Deployment not found: ${deploymentId}`)
    return deployment
  }

  async undeploy(deploymentId: string) {
    const deployment = await this.prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
    })
    if (!deployment) throw new NotFoundException(`Deployment not found: ${deploymentId}`)
    if (deployment.status === 'inactive') {
      throw new ConflictException('Already undeployed')
    }
    return this.prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: { status: 'inactive', undeployedAt: new Date() },
    })
  }

  async issueApiKey(deploymentId: string, dto: IssueDeploymentApiKeyDto) {
    const deployment = await this.prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
      include: { env: true },
    })
    if (!deployment) throw new NotFoundException(`Deployment not found: ${deploymentId}`)

    const rawKey = `as_${crypto.randomBytes(24).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex')
    const keyPrefix = rawKey.slice(0, 8)
    const keySuffix = rawKey.slice(-4)

    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        keyHash,
        keyPrefix,
        keySuffix,
        projectId: deployment.projectId,
        environment: deployment.env.slug,
        endpointIds: [],
        agentDeploymentId: deployment.id,
        scopes: dto.scopes && dto.scopes.length > 0 ? dto.scopes : DEFAULT_SCOPES,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        enabled: true,
        status: 'active',
      },
    })

    return {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      keySuffix: created.keySuffix,
      keyMasked: `${created.keyPrefix}...${created.keySuffix}`,
      rawKey,
      scopes: created.scopes,
      validFrom: created.validFrom,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    }
  }

  async listApiKeys(deploymentId: string) {
    const deployment = await this.prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
      select: { id: true },
    })
    if (!deployment) throw new NotFoundException(`Deployment not found: ${deploymentId}`)

    const keys = await this.prisma.apiKey.findMany({
      where: { agentDeploymentId: deploymentId },
      orderBy: { createdAt: 'desc' },
    })
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyMasked: `${k.keyPrefix}...${k.keySuffix}`,
      scopes: k.scopes,
      status: k.status,
      enabled: k.enabled,
      validFrom: k.validFrom,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }))
  }

  async revokeApiKey(keyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id: keyId } })
    if (!apiKey) throw new NotFoundException(`API key not found: ${keyId}`)
    if (apiKey.status === 'revoked') {
      throw new ConflictException('Already revoked')
    }
    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'revoked', enabled: false },
    })
  }

  private buildSnapshot(agent: {
    id: string
    name: string
    slug: string
    description: string
    type: string
    architecture: string
    systemPrompt: string
    modelId: string
    toolIds: string[]
    toolGroupIds: string[]
    mcpServerIds: string[]
    builtinToolIds: string[]
    skillIds: string[]
    graphDefinition: unknown
    config: unknown
    hitlPolicy: unknown
    reasoningConfig: unknown
    memoryConfig: unknown
    guardrailsConfig: unknown
    planningConfig: unknown
    outputSchema: unknown
    toolPermissions: unknown
  }): object {
    return {
      id: agent.id,
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
      capturedAt: new Date().toISOString(),
    }
  }
}
