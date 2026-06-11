import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { App, LogLevel } from '@slack/bolt'
import { PrismaService } from '../../prisma/prisma.service'
import { decryptCredential } from '../../common/credential-cipher'
import { SlackInstallationsService } from './slack-installations.service'
import { SlackChannelAgentsService } from './slack-channel-agents.service'

interface SlackAppMentionEvent {
  type: 'app_mention'
  text: string
  ts: string
  event_ts?: string
  thread_ts?: string
  channel: string
  user?: string
}

interface SlackGenericMessageEvent {
  type: 'message'
  text?: string
  ts: string
  event_ts?: string
  thread_ts?: string
  channel: string
  channel_type?: string
  user?: string
}

/** 중복 이벤트 dedupe — event_ts 기준 in-memory TTL Set */
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
    // 오래된 항목 정리 (최대 1000개 유지)
    if (this.store.size > 1000) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
  }
}

interface InvokeResponse {
  threadId?: string
  messages?: Array<{ role?: string; content?: unknown }>
  [key: string]: unknown
}

@Injectable()
export class SlackRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackRuntimeService.name)
  private boltApp: App | null = null
  private readonly dedupe = new DedupeSet()

  constructor(
    private readonly prisma: PrismaService,
    private readonly installationsService: SlackInstallationsService,
    private readonly channelAgentsService: SlackChannelAgentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const installation = await this.installationsService.getWithDecryptedTokens({ enabled: true })
    if (!installation) {
      this.logger.log('Slack disabled (no installation)')
      return
    }
    await this.start(installation)
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop()
  }

  async start(installation: {
    id: string
    projectId: string
    installedByUserId: string | null
    workspaceTeamId: string
    botToken: string
    appToken: string
  }): Promise<void> {
    await this.stop()

    const app = new App({
      token: installation.botToken,
      appToken: installation.appToken,
      socketMode: true,
      logLevel: LogLevel.DEBUG,
    })

    // 채널에서 봇 멘션 이벤트
    app.event('app_mention', async ({ event, client }) => {
      this.logger.log(
        `[app_mention] channel=${(event as { channel?: string }).channel} text=${String(
          (event as { text?: string }).text ?? '',
        ).slice(0, 100)}`,
      )
      await this.handleEvent({
        event: event as unknown as SlackAppMentionEvent,
        client,
        teamId: installation.workspaceTeamId,
        installedByUserId: installation.installedByUserId,
        eventMode: 'channel',
      })
    })

    // DM 이벤트 — channel_type === 'im' 만 처리
    app.event('message', async ({ event, client }) => {
      const msg = event as unknown as SlackGenericMessageEvent
      this.logger.log(
        `[message] channel_type=${msg.channel_type} channel=${msg.channel} text=${String(msg.text ?? '').slice(0, 100)}`,
      )
      if (msg.channel_type !== 'im') return
      await this.handleEvent({
        event: msg,
        client,
        teamId: installation.workspaceTeamId,
        installedByUserId: installation.installedByUserId,
        eventMode: 'dm',
      })
    })

    // 에러 핸들러 — Bolt 내부 에러 추적
    app.error(async (error) => {
      this.logger.error('[Bolt error]', error)
    })

    try {
      await app.start()
      this.boltApp = app
      this.logger.log(`Slack Bolt App 시작 — workspace: ${installation.workspaceTeamId}`)
    } catch (err) {
      this.logger.error('Slack Bolt App 시작 실패', err)
    }
  }

  async stop(): Promise<void> {
    if (!this.boltApp) return
    try {
      await this.boltApp.stop()
    } catch (err) {
      this.logger.warn('Slack Bolt App 종료 중 오류 (무시)', err)
    }
    this.boltApp = null
    this.logger.log('Slack Bolt App 종료')
  }

  /** enable/disable 토글 또는 토큰 갱신 후 재기동 */
  async restart(): Promise<void> {
    const installation = await this.installationsService.getWithDecryptedTokens({ enabled: true })
    if (!installation) {
      await this.stop()
      return
    }
    await this.start(installation)
  }

  private async handleEvent({
    event,
    client,
    teamId,
    installedByUserId,
    eventMode,
  }: {
    event: SlackAppMentionEvent | SlackGenericMessageEvent
    client: Parameters<Parameters<App['event']>[1]>[0]['client']
    teamId: string
    installedByUserId: string | null
    eventMode: 'channel' | 'dm'
  }): Promise<void> {
    const eventTs = 'event_ts' in event ? (event.event_ts as string) : event.ts
    if (!eventTs) return

    // 중복 이벤트 무시
    if (this.dedupe.has(eventTs)) return
    this.dedupe.add(eventTs)

    const channelId = event.channel
    const slackThreadTs = ('thread_ts' in event ? event.thread_ts : undefined) ?? event.ts
    const rawText = ('text' in event ? event.text : '') ?? ''

    // 멘션 prefix 제거 — <@UXXXXXX> 패턴
    const userText = eventMode === 'channel'
      ? rawText.replace(/^<@[A-Z0-9]+>\s*/i, '').trim()
      : rawText.trim()

    if (!userText) return

    // 채널-Agent 매핑 조회
    const mapping = await this.channelAgentsService.find(teamId, channelId, eventMode)
    if (!mapping) return

    let answerText: string
    try {
      answerText = await this.invokeAgent(
        mapping.agentId,
        mapping.projectId,
        installedByUserId,
        userText,
        teamId,
        channelId,
        slackThreadTs,
      )
    } catch (err) {
      this.logger.error(`Agent 호출 실패 — channel: ${channelId}`, err)
      try {
        await client.chat.postMessage({
          channel: channelId,
          ...(eventMode === 'channel' ? { thread_ts: slackThreadTs } : {}),
          text: '죄송합니다, 응답 생성 중 오류가 발생했습니다. (관리자에게 문의)',
        })
      } catch (postErr) {
        this.logger.error('에러 메시지 Slack 게시 실패', postErr)
      }
      return
    }

    try {
      await client.chat.postMessage({
        channel: channelId,
        ...(eventMode === 'channel' ? { thread_ts: slackThreadTs } : {}),
        text: answerText,
      })
    } catch (err) {
      this.logger.error('Slack 답변 게시 실패', err)
    }
  }

  /**
   * 사용자 자격증명을 `kind:targetId → 평문` dict 로 복호화한다.
   * 복호화 실패한 행은 skip 하여 부분 자격증명만 inject (전체 실패 방지).
   * runner 측 deepagent_bridge 가 `provider:{slug}` 키로 조회한다.
   */
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

  private async invokeAgent(
    agentId: string,
    projectId: string,
    installedByUserId: string | null,
    message: string,
    slackTeamId: string,
    slackChannelId: string,
    slackThreadTs: string,
  ): Promise<string> {
    // 같은 Slack thread_ts 에 매핑된 AgentStudio Thread 재사용
    const existingThread = await this.prisma.thread.findFirst({
      where: {
        agentId,
        metadata: {
          path: ['slackThreadTs'],
          equals: slackThreadTs,
        },
      },
      select: { id: true },
    })

    let threadId: string
    if (existingThread) {
      threadId = existingThread.id
    } else {
      const newThread = await this.prisma.thread.create({
        data: {
          projectId,
          agentId,
          // 설치한 admin 의 자격증명(OpenAI/Anthropic key 등)으로 실행되도록 userId 주입
          userId: installedByUserId,
          metadata: {
            source: 'slack',
            slackChannelId,
            slackTeamId,
            slackThreadTs,
          },
        },
        select: { id: true },
      })
      threadId = newThread.id
    }

    const runnerUrl = process.env.RUNNER_URL ?? 'http://localhost:28003'
    const runnerKey = process.env.RUNNER_INTERNAL_KEY ?? 'internal-service-key'

    // 설치한 admin 의 자격증명(provider/tool 키)을 복호화해 runner 로 전달.
    // 웹 채팅 경로(threads.service)와 동일하게 userCredentials + userId + source 를 넘긴다.
    const userCredentials = installedByUserId
      ? await this.collectUserCredentials(installedByUserId)
      : undefined

    const res = await fetch(`${runnerUrl}/api/v1/threads/${threadId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': runnerKey,
      },
      body: JSON.stringify({ message, userCredentials, userId: installedByUserId, source: 'slack' }),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string; message?: string }
      throw new Error(err.detail ?? err.message ?? `Runner HTTP ${res.status}`)
    }

    const data = (await res.json()) as InvokeResponse

    // messages 배열에서 마지막 assistant 메시지 추출
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      for (let i = data.messages.length - 1; i >= 0; i--) {
        const msg = data.messages[i]
        if (msg?.role === 'assistant' || msg?.role === 'ai') {
          const content = msg.content
          if (typeof content === 'string' && content.trim()) {
            return content.trim()
          }
        }
      }
    }

    return '응답을 처리했지만 텍스트를 추출할 수 없습니다.'
  }
}
