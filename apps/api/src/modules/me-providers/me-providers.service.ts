import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { encryptCredential } from '../../common/credential-cipher'
import { PrismaService } from '../../prisma/prisma.service'
import { AddProviderDto } from './dto/add-provider.dto'

@Injectable()
export class MeProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 등록 가능한 Provider 카탈로그 + 본인 보유 여부.
   * 본 서비스는 시스템에 등록된 Provider 행을 모두 반환하고, 사용자의
   * UserCredential(kind=provider, targetId=provider.slug) 매칭을 표시한다.
   */
  async catalog(userId: string) {
    const [providers, myCreds] = await Promise.all([
      this.prisma.provider.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          iconUrl: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userCredential.findMany({
        where: { userId, kind: 'provider' },
        select: { id: true, targetId: true, label: true, status: true, lastVerifiedAt: true },
      }),
    ])

    const credBySlug = new Map<string, typeof myCreds>()
    for (const c of myCreds) {
      const arr = credBySlug.get(c.targetId) ?? []
      arr.push(c)
      credBySlug.set(c.targetId, arr)
    }

    return providers.map((p) => {
      const userCreds = credBySlug.get(p.slug) ?? []
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        type: p.type,
        iconUrl: p.iconUrl ?? null,
        owned: userCreds.length > 0,
        userCredentials: userCreds.map((c) => ({
          id: c.id,
          label: c.label,
          status: c.status,
          lastVerifiedAt: c.lastVerifiedAt ? c.lastVerifiedAt.toISOString() : null,
        })),
      }
    })
  }

  async addProvider(userId: string, dto: AddProviderDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
      select: { id: true, slug: true, name: true },
    })
    if (!provider) throw new NotFoundException(`Provider 를 찾을 수 없습니다: ${dto.providerId}`)

    try {
      const created = await this.prisma.userCredential.create({
        data: {
          userId,
          kind: 'provider',
          targetId: provider.slug,
          label: dto.label?.trim() ?? '',
          valueEnc: encryptCredential(dto.value),
          metadata: (dto.metadata as object) ?? null,
          status: 'active',
        },
        select: { id: true, kind: true, targetId: true, label: true, status: true, createdAt: true },
      })
      return {
        id: created.id,
        provider: { id: provider.id, slug: provider.slug, name: provider.name },
        kind: created.kind,
        targetId: created.targetId,
        label: created.label,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      }
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          '이미 동일한 Provider 자격증명이 등록되어 있습니다 (라벨로 구분 가능).',
        )
      }
      throw err
    }
  }
}
