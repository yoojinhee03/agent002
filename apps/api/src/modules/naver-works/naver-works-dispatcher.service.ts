import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { decryptCredential } from '../../common/credential-cipher'
import type { DecryptedInstallation } from './naver-works-installations.service'

export interface NaverWorksMessagePayload {
  type: 'message'
  source: {
    userId: string
    channelId?: string | null
    domainId?: number
  }
  issuedTime?: string
  content: {
    type: 'text' | string
    text?: string
    [k: string]: unknown
  }
}

@Injectable()
export class NaverWorksDispatcherService {
  private readonly logger = new Logger(NaverWorksDispatcherService.name)
  private readonly dedupe = new DedupeSet()

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1:1 message 이벤트를 AgentStudio 에이전트로 dispatch.
   * - 같은 (botId + naverUserId) 조합은 단일 thread 를 재사용해 대화 맥락 유지.
   * - thread.metadata 에 requester(=NAVER WORKS 사용자) + 외부 채널 식별자 + replyEndpoint 저장.
   * - 응답 push 는 runner-py 가 turn 완료 시 replyEndpoint 로 호출.
   */
  async handle(
    installation: DecryptedInstallation,
    payload: NaverWorksMessagePayload,
  ): Promise<void> {
    const naverUserId = payload.source?.userId
    const text = payload.content?.type === 'text' ? (payload.content.text ?? '') : ''

    if (!naverUserId) {
      this.logger.warn('NAVER WORKS message payload 에 source.userId 없음 — 무시')
      return
    }

    if (payload.content?.type !== 'text') {
      this.logger.log(
        `비텍스트 메시지 무시 (botId=${installation.botId}, userId=${naverUserId}, content.type=${payload.content?.type})`,
      )
      // 추후 file/image 처리 시 별도 안내 메시지 송신 로직 추가
      return
    }

    const cleanedText = text.trim()
    if (!cleanedText) return

    // 중복 dispatch 방지 — issuedTime 기준
    const dedupeKey = `${installation.botId}:${naverUserId}:${payload.issuedTime ?? ''}:${cleanedText.slice(0, 50)}`
    if (this.dedupe.has(dedupeKey)) return
    this.dedupe.add(dedupeKey)

    // thread upsert — (botId, naverUserId) 기준 단일 thread 재사용
    const existing = await this.prisma.thread.findFirst({
      where: {
        agentId: installation.agentId,
        metadata: {
          path: ['source'],
          equals: 'naver_works',
        },
        AND: [
          {
            metadata: {
              path: ['naverUserId'],
              equals: naverUserId,
            },
          },
          {
            metadata: {
              path: ['botId'],
              equals: installation.botId,
            },
          },
        ],
      },
      select: { id: true },
    })

    let threadId: string
    if (existing) {
      threadId = existing.id
    } else {
      const created = await this.prisma.thread.create({
        data: {
          projectId: installation.projectId,
          agentId: installation.agentId,
          userId: installation.installedByUserId,
          metadata: {
            source: 'naver_works',
            botId: installation.botId,
            installationId: installation.id,
            naverUserId,
            requester: {
              naverUserId,
              name: null,
              email: null,
            },
          },
        },
        select: { id: true },
      })
      threadId = created.id
    }

    const runnerUrl = process.env.RUNNER_URL ?? 'http://localhost:28003'
    const runnerKey = process.env.RUNNER_INTERNAL_KEY ?? 'internal-service-key'

    const userCredentials = installation.installedByUserId
      ? await this.collectUserCredentials(installation.installedByUserId)
      : undefined

    try {
      const res = await fetch(`${runnerUrl}/api/v1/threads/${threadId}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': runnerKey,
        },
        body: JSON.stringify({
          message: cleanedText,
          userCredentials,
          userId: installation.installedByUserId,
          source: 'naver_works',
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        this.logger.error(
          `Runner invoke 실패 HTTP ${res.status} (threadId=${threadId}): ${text.slice(0, 300)}`,
        )
      }
    } catch (err) {
      this.logger.error(
        `Runner invoke 호출 오류 (threadId=${threadId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  private async collectUserCredentials(userId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.userCredential.findMany({
      where: { userId, status: 'active' },
      select: { kind: true, targetId: true, valueEnc: true },
    })
    const dict: Record<string, string> = {}
    for (const r of rows) {
      try {
        dict[`${r.kind}:${r.targetId}`] = decryptCredential(r.valueEnc)
      } catch (err) {
        this.logger.warn(
          `decrypt failed for credential ${r.kind}:${r.targetId} (userId=${userId}): ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        )
      }
    }
    return dict
  }
}

/** 중복 이벤트 dedupe — TTL Set */
class DedupeSet {
  private readonly store = new Map<string, number>()
  private readonly ttlMs: number

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs
  }

  has(key: string): boolean {
    const ts = this.store.get(key)
    if (ts === undefined) return false
    if (Date.now() - ts > this.ttlMs) {
      this.store.delete(key)
      return false
    }
    return true
  }

  add(key: string): void {
    this.store.delete(key)
    this.store.set(key, Date.now())
    if (this.store.size > 1000) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
  }
}
