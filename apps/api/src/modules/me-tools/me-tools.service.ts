import { Injectable } from '@nestjs/common'
import { GmailOAuthService } from '../me-credentials/gmail-oauth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TOOL_CATALOG } from '../client-agents/tool-credential-map'

@Injectable()
export class MeToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailOAuth: GmailOAuthService,
  ) {}

  /**
   * 도구 자격증명 카탈로그(`UserCredential.kind=tool` 슬롯) + 본인 보유 여부.
   *
   * `targetId` 기준으로 dedup 된 catalog (예: `gmail` 1개 = gmail_search/send/... 모두 사용)
   * + 사용자가 등록한 자격증명 매칭.
   *
   * Gmail (OAuth) 의 경우 `oauth-app` 라벨 row 의 refresh_token 존재 여부로 connected 판정.
   */
  async catalog(userId: string) {
    const myCreds = await this.prisma.userCredential.findMany({
      where: { userId, kind: 'tool' },
      select: { id: true, targetId: true, label: true, status: true, lastVerifiedAt: true },
    })
    const credByTarget = new Map<string, typeof myCreds>()
    for (const c of myCreds) {
      const arr = credByTarget.get(c.targetId) ?? []
      arr.push(c)
      credByTarget.set(c.targetId, arr)
    }

    const gmailApp = await this.gmailOAuth.getApp(userId)

    return TOOL_CATALOG.map((t) => {
      const userCredentials = credByTarget.get(t.targetId) ?? []
      const owned =
        t.targetId === 'gmail'
          ? gmailApp.connected
          : userCredentials.length > 0

      return {
        targetId: t.targetId,
        label: t.label,
        description: t.description,
        authType: t.authType,
        triggers: t.triggers,
        owned,
        userCredentials: userCredentials.map((c) => ({
          id: c.id,
          label: c.label,
          status: c.status,
          lastVerifiedAt: c.lastVerifiedAt ? c.lastVerifiedAt.toISOString() : null,
        })),
      }
    })
  }
}
