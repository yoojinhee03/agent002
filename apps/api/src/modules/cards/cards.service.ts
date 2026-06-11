import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export type CardCategory = 'hitl'

export interface CardDefinitionDto {
  id?: string
  cardId: string
  version?: number
  tenantId?: string | null
  name: string
  category?: CardCategory
  /** 디자인 레이아웃 id (hitl-layouts.tsx). 기본 'sky-standard'. */
  layout?: string
  /** 매칭할 도구 이름 배열. 비어 있으면 generic fallback. */
  targetTools?: string[]
  /** 도구 인자별 라벨/위젯/도움말 메타. null = typeof introspection. */
  argSchema?: unknown | null
  /** Adaptive Card payload (adaptivecards-templating 의 ${} 바인딩 사용 가능). */
  payload: Record<string, unknown>
  /** 빌더 미리보기 / 런타임 fallback 용 샘플 데이터. */
  sampleData?: Record<string, unknown>
}

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  list(opts: { cardId?: string; tenantId?: string | null; category?: CardCategory } = {}) {
    return this.prisma.cardDefinition.findMany({
      where: {
        ...(opts.cardId ? { cardId: opts.cardId } : {}),
        ...(opts.tenantId !== undefined ? { tenantId: opts.tenantId } : {}),
        ...(opts.category ? { category: opts.category } : {}),
      },
      orderBy: [{ cardId: 'asc' }, { version: 'desc' }],
    })
  }

  async getLatest(cardId: string) {
    const card = await this.prisma.cardDefinition.findFirst({
      where: { cardId },
      orderBy: { version: 'desc' },
    })
    if (!card) throw new NotFoundException(`Card not found: ${cardId}`)
    return card
  }

  async getVersion(cardId: string, version: number) {
    const card = await this.prisma.cardDefinition.findUnique({
      where: { cardId_version: { cardId, version } },
    })
    if (!card) throw new NotFoundException(`Card not found: ${cardId}@v${version}`)
    return card
  }

  /**
   * cardId 가 어느 에이전트 HITL 도구 권한에서 참조되는지 조사.
   *  - toolPermissions.<toolId>.cardId  (policy='requires_approval' 의 override)
   */
  async findUsages(cardId: string) {
    const agents = await this.prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        projectId: true,
        toolPermissions: true,
      },
    })
    const hitlRefs: Array<{ agentId: string; agentName: string; projectId: string; toolId: string }> = []
    for (const a of agents) {
      const perms = a.toolPermissions as Record<string, unknown> | null
      if (perms && typeof perms === 'object') {
        for (const [toolId, raw] of Object.entries(perms)) {
          const entry = raw as { cardId?: string } | null
          if (entry?.cardId === cardId) {
            hitlRefs.push({ agentId: a.id, agentName: a.name, projectId: a.projectId, toolId })
          }
        }
      }
    }
    return { cardId, hitlRefs }
  }

  async create(dto: CardDefinitionDto) {
    // version 자동 발급(생략 시 v1, 또는 cardId 의 max+1)
    let version = dto.version ?? 0
    if (!version) {
      const max = await this.prisma.cardDefinition.findFirst({
        where: { cardId: dto.cardId },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      version = (max?.version ?? 0) + 1
    } else {
      // 중복 방어
      const existing = await this.prisma.cardDefinition.findUnique({
        where: { cardId_version: { cardId: dto.cardId, version } },
      })
      if (existing) {
        throw new ConflictException(`Card already exists: ${dto.cardId}@v${version}`)
      }
    }
    return this.prisma.cardDefinition.create({
      data: {
        cardId: dto.cardId,
        version,
        tenantId: dto.tenantId ?? null,
        name: dto.name,
        category: dto.category ?? 'hitl',
        layout: dto.layout ?? 'sky-standard',
        targetTools: dto.targetTools ?? [],
        argSchema:
          dto.argSchema == null
            ? Prisma.JsonNull
            : (dto.argSchema as Prisma.InputJsonValue),
        payload: dto.payload as object,
        sampleData: (dto.sampleData ?? {}) as object,
      },
    })
  }

  /**
   * 도구 이름에 매칭되는 카드 ID 검색.
   *  1. targetTools 에 toolName 포함된 카드 중 최신 cardId
   *  2. 없으면 'hitl-input-card' (generic fallback)
   */
  async resolveCardForTool(toolName: string, tenantId?: string | null): Promise<string> {
    const matches = await this.prisma.cardDefinition.findMany({
      where: {
        category: 'hitl',
        ...(tenantId !== undefined ? { tenantId } : {}),
        targetTools: { has: toolName },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { cardId: true },
    })
    return matches[0]?.cardId ?? 'hitl-input-card'
  }
}
