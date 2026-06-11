import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import crypto from 'crypto'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

@Injectable()
export class EndpointsService {
  private readonly apiServiceUrl = process.env.API_SERVICE_URL || 'http://localhost:4000'

  constructor(private readonly prisma: PrismaService) {}

  private generateRawApiKey() {
    return `as_${crypto.randomBytes(24).toString('hex')}`
  }

  private hashApiKey(rawKey: string) {
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex')
  }

  private maskKey(prefix: string, suffix: string) {
    return `${prefix}****${suffix}`
  }

  async list(projectId: string) {
    const endpoints = await this.prisma.endpoint.findMany({
      where: { workflow: { projectId } },
      include: { workflow: true, deployment: true, version: true },
    })

    return endpoints.map((ep) => ({
      ...ep,
      description: ep.description,
      url: this.getEndpointUrl(ep),
    }))
  }

  async findByProject(projectId: string) {
    const endpoints = await this.prisma.endpoint.findMany({
      where: {
        workflow: { projectId },
      },
      include: {
        workflow: true,
      },
    })

    return endpoints.map((ep) => ({
      ...ep,
      description: ep.description,
      url: this.getEndpointUrl(ep),
    }))
  }

  async getEndpointUrl(endpoint: {
    projectSlug: string
    workflowSlug: string
    environment: string
  }) {
    return `${this.apiServiceUrl}/api/v1/workflows/${endpoint.projectSlug}/${endpoint.workflowSlug}/${endpoint.environment}/run`
  }

  async listApiKeys(projectId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      key: this.maskKey(k.keyPrefix, k.keySuffix),
      projectId: k.projectId,
      environment: k.environment,
      endpointIds: k.endpointIds,
      scopes: k.scopes,
      validFrom: k.validFrom ? k.validFrom.toISOString() : null,
      expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
      enabled: k.enabled,
      status: k.status,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    }))
  }

  async createApiKey(projectId: string, dto: CreateApiKeyDto) {
    const rawKey = this.generateRawApiKey()
    const keyHash = this.hashApiKey(rawKey)

    const keyPrefix = rawKey.slice(0, 8)
    const keySuffix = rawKey.slice(-4)

    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        keyHash,
        keyPrefix,
        keySuffix,
        projectId,
        environment: dto.environment,
        endpointIds: dto.endpointIds ?? [],
        scopes: dto.scopes ?? [],
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        enabled: true,
        status: 'active',
      },
    })

    return {
      id: created.id,
      name: created.name,
      key: rawKey,
      projectId: created.projectId,
      environment: created.environment,
      endpointIds: created.endpointIds,
      scopes: created.scopes,
      validFrom: created.validFrom ? created.validFrom.toISOString() : null,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      enabled: created.enabled,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      lastUsedAt: created.lastUsedAt ? created.lastUsedAt.toISOString() : null,
    }
  }

  async revokeApiKey(id: string) {
    await this.prisma.apiKey.update({
      where: { id },
      data: { status: 'revoked', enabled: false },
    })
    return { success: true }
  }

  async toggleApiKey(id: string) {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } })
    if (!existing) return null

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { enabled: !existing.enabled },
    })

    return {
      id: updated.id,
      name: updated.name,
      key: this.maskKey(updated.keyPrefix, updated.keySuffix),
      projectId: updated.projectId,
      environment: updated.environment,
      endpointIds: updated.endpointIds,
      scopes: updated.scopes,
      validFrom: updated.validFrom ? updated.validFrom.toISOString() : null,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      enabled: updated.enabled,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
    }
  }
}
