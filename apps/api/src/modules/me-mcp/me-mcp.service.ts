import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { RequiredUserField } from '@agent-studio/shared'

/**
 * MCP 서버 자격증명 카탈로그(`UserCredential.kind=mcp` 슬롯) + 본인 보유 여부.
 *
 * - credentialMode === 'per_user' 인 서버만 "필수 인증 대상"으로 분류한다.
 * - 필수 필드는 requiredUserFields 우선, 비어 있으면 config.env 키 fallback.
 */
@Injectable()
export class MeMcpService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(userId: string) {
    const [servers, myCreds] = await Promise.all([
      this.prisma.mcpServer.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          transport: true,
          config: true,
          credentialMode: true,
          requiredUserFields: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userCredential.findMany({
        where: { userId, kind: 'mcp' },
        select: { id: true, targetId: true, label: true, status: true, lastVerifiedAt: true },
      }),
    ])

    const credByTarget = new Map<string, typeof myCreds>()
    for (const c of myCreds) {
      const arr = credByTarget.get(c.targetId) ?? []
      arr.push(c)
      credByTarget.set(c.targetId, arr)
    }

    return servers
      .filter((s) => s.credentialMode === 'per_user')
      .map((s) => {
        const cfg = (s.config ?? {}) as { env?: Record<string, string> }
        const fields = this.resolveRequiredFields(s.requiredUserFields, cfg.env)
        const userCreds = credByTarget.get(s.id) ?? []
        return {
          targetId: s.id,
          label: s.name,
          description: s.description ?? null,
          transport: s.transport,
          credentialMode: s.credentialMode,
          fields,
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

  /**
   * requiredUserFields(Json?) 우선 반환.
   * 비어있으면 config.env 키에서 fallback 생성 ({key, label=key, secret=true, required=true}).
   */
  resolveRequiredFields(
    requiredUserFields: unknown,
    configEnv?: Record<string, string>,
  ): RequiredUserField[] {
    if (Array.isArray(requiredUserFields) && requiredUserFields.length > 0) {
      return requiredUserFields as RequiredUserField[]
    }
    const envKeys = Object.keys(configEnv ?? {})
    return envKeys.map((key) => ({ key, label: key, secret: true, required: true }))
  }
}
