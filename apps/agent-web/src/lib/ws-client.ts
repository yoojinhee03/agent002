import { io, Socket } from 'socket.io-client'
import type { WebSocketEvent } from '@agent-studio/shared'

type EventHandler = (event: WebSocketEvent) => void

const LS_ACCESS = 'as_access_token'

class WsClient {
  private socket: Socket | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private subscribedThreads = new Set<string>()

  /**
   * WebSocket 연결 초기화
   */
  connect() {
    // 이미 소켓이 있고 연결 중이거나 연결된 상태면 건너뜀
    if (this.socket?.connected) {
      console.log('[WS] Socket already connected with ID:', this.socket.id)
      return
    }

    const runnerUrl = process.env.NEXT_PUBLIC_RUNNER_URL || 'http://localhost:4300'
    const token = typeof window !== 'undefined' ? localStorage.getItem(LS_ACCESS) : null

    // 기본 네임스페이스(/)로 연결 — 서버 핸들러는 기본 네임스페이스에 등록되어 있음
    const connectionUrl = runnerUrl.replace(/\/$/, '')
    console.log(`[WS] Attempting to connect to: ${connectionUrl}...`)

    if (this.socket) {
      console.log('[WS] Reusing existing socket instance, reconnecting...')
      this.socket.connect()
      return
    }

    this.socket = io(connectionUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    })

    this.socket.on('connect', () => {
      console.log('[WS] Connected with ID:', this.socket?.id)
      // 재연결 시 기존 구독 복원
      for (const threadId of this.subscribedThreads) {
        console.log(`[WS] Resubscribing to thread: ${threadId}`)
        this.socket?.emit('thread.subscribe', { threadId })
      }
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason)
    })

    this.socket.on('connect_error', (error) => {
      console.warn('[WS] Connection Error (will retry):', error.message)
    })

    this.socket.on('error', (error) => {
      console.error('[WS] Socket Error:', error)
    })

    // 모든 이벤트 타입 리스닝
    const eventTypes = [
      'hitl.request',
      'hitl.responded',
      'hitl.timeout_warning',
      'thread.message.received',
      // Turn 이벤트
      'turn.started',
      'turn.completed',
      'thread.updated',
      // Agent 토큰 이벤트
      'agent.token',
      'agent.reasoning',
      // Step 이벤트 (started/completed/failed 분리)
      'step.started',
      'step.completed',
      'step.failed',
      // Plan 이벤트
      'plan.created',
      // Agent Assistant — 캔버스 노드 스트리밍 + 세션 종료 + 진행 단계 + 부분 수정 제안
      // 주의: 여기 등록 안 된 이벤트는 wsClient.on(...) 으로 핸들러를 걸어도 socket.io 가
      // dispatch 하지 않으므로 호출되지 않는다 (회귀 사례: edit/step 누락).
      'assistant.node_proposed',
      'assistant.session_complete',
      'assistant.step',
      'assistant.edit_proposed',
      // Skill Assistant — 스킬 생성/수정/분석 제안 이벤트
      'assistant.skill_proposed',
      'assistant.skill_edit_proposed',
      'assistant.skill_analyzed',
      'assistant.choices_offered',
    ]

    for (const eventType of eventTypes) {
      this.socket.on(eventType, (data: WebSocketEvent) => {
        console.log(`[WS] Received event: ${eventType}`, data)
        this.emit(eventType, data)
      })
    }
  }

  /**
   * 연결 해제
   */
  disconnect() {
    this.socket?.disconnect()
    this.socket = null
    this.subscribedThreads.clear()
  }

  /**
   * 스레드 구독
   */
  subscribeThread(threadId: string) {
    this.subscribedThreads.add(threadId)
    this.socket?.emit('thread.subscribe', { threadId })
  }

  /**
   * 스레드 구독 해제
   */
  unsubscribeThread(threadId: string) {
    this.subscribedThreads.delete(threadId)
    this.socket?.emit('thread.unsubscribe', { threadId })
  }

  /**
   * HITL 응답 전송
   *
   * source: 'studio' (admin 페이지) | 'client' (client 페이지) — 자격증명 소스 분기에 사용.
   * runner 가 resume 시 이 source 로 Gmail OAuth 자격증명 소스를 결정.
   */
  respondToInteraction(
    interactionId: string,
    response: unknown,
    userId: string,
    source?: 'studio' | 'client',
  ) {
    this.socket?.emit('hitl.respond', { interactionId, response, userId, source })
  }

  /**
   * 채팅 메시지 전송
   */
  sendMessage(threadId: string, content: string) {
    this.socket?.emit('thread.message', { threadId, content })
  }

  /**
   * 이벤트 핸들러 등록
   */
  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  /**
   * 이벤트 핸들러 해제
   */
  off(event: string, handler: EventHandler) {
    this.handlers.get(event)?.delete(handler)
  }

  /**
   * 내부 이벤트 발행
   */
  private emit(event: string, data: WebSocketEvent) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        handler(data)
      }
    }
  }

  /**
   * 소켓이 연결될 때까지 대기 (최대 timeout ms)
   * 이미 연결된 경우 즉시 resolve, timeout 초과 시에도 resolve (invoke는 진행)
   */
  waitForConnection(timeout = 5000): Promise<void> {
    if (this.socket?.connected) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeout)
      const handleConnect = () => {
        clearTimeout(timer)
        this.socket?.off('connect', handleConnect)
        resolve()
      }
      if (this.socket) {
        this.socket.on('connect', handleConnect)
      } else {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  /**
   * 연결 상태 확인
   */
  get isConnected() {
    return this.socket?.connected ?? false
  }
}

export const wsClient = new WsClient()
