import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { decryptCredential, encryptCredential } from '../../common/credential-cipher'
import { PrismaService } from '../../prisma/prisma.service'

const GMAIL_TARGET_ID = 'gmail'
const OAUTH_APP_LABEL = 'oauth-app'

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
]

interface OAuthAppMetadata {
  clientId: string
  redirectUri: string
  scopes: string[]
  connectedAt?: string | null
  /** 마지막 OAuth 콜백에서 Google profile 로 조회한 실제 연결 계정 (사용자 식별·잘못 연결 방지용) */
  connectedEmail?: string | null
}

interface OAuthAppSecrets {
  clientSecret?: string
  refreshToken?: string
}

interface GmailRowSnapshot {
  id: string
  metadata: OAuthAppMetadata
  secrets: OAuthAppSecrets
  status: 'active' | 'invalid' | 'expired'
  lastVerifiedAt: Date | null
}

@Injectable()
export class GmailOAuthService {
  private readonly logger = new Logger(GmailOAuthService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getApp(userId: string) {
    const row = await this.findRow(userId)
    if (!row) {
      return {
        configured: false,
        connected: false,
        clientId: '',
        redirectUri: '',
        scopes: DEFAULT_SCOPES,
        hasClientSecret: false,
        connectedAt: null,
        connectedEmail: null as string | null,
        status: null as 'active' | 'invalid' | 'expired' | null,
      }
    }
    return {
      configured: !!row.secrets.clientSecret,
      connected: !!row.secrets.refreshToken,
      clientId: row.metadata.clientId,
      redirectUri: row.metadata.redirectUri,
      scopes: row.metadata.scopes,
      hasClientSecret: !!row.secrets.clientSecret,
      connectedAt: row.metadata.connectedAt ?? null,
      connectedEmail: row.metadata.connectedEmail ?? null,
      status: row.status,
    }
  }

  async saveApp(
    userId: string,
    body: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] },
  ) {
    if (!body.clientId?.trim()) throw new BadRequestException('clientId is required')
    if (!body.redirectUri?.trim()) throw new BadRequestException('redirectUri is required')
    const redirectUri = body.redirectUri.trim()
    if (!redirectUri.startsWith('http://') && !redirectUri.startsWith('https://')) {
      throw new BadRequestException('redirectUri must start with http:// or https://')
    }

    const existing = await this.findRow(userId)
    const newClientId = body.clientId.trim()
    const nextSecret = body.clientSecret?.trim()
    const explicitNewSecret = !!(nextSecret && nextSecret !== '********')
    const clientSecret = explicitNewSecret ? nextSecret : existing?.secrets.clientSecret
    if (!clientSecret) throw new BadRequestException('clientSecret is required')

    // OAuth 앱(clientId / clientSecret) 자체가 바뀌면 기존 refresh_token 은 새 앱과 호환되지
    // 않아 Google 이 invalid_grant 로 거절하고 (이 코드 경로 외부에서) admin Gmail 로 누수될
    // 위험이 있다. 변경 감지 시 refresh_token 을 즉시 폐기하고 status='invalid' 로 설정해
    // 사용자가 명시적으로 재연결하도록 강제.
    const clientIdChanged = !!existing && existing.metadata.clientId !== newClientId
    const clientSecretChanged =
      !!existing && explicitNewSecret && nextSecret !== existing.secrets.clientSecret
    const oauthAppChanged = clientIdChanged || clientSecretChanged

    const metadata: OAuthAppMetadata = {
      clientId: newClientId,
      redirectUri,
      scopes: body.scopes && body.scopes.length > 0 ? body.scopes : DEFAULT_SCOPES,
      connectedAt: oauthAppChanged ? null : existing?.metadata.connectedAt ?? null,
      connectedEmail: oauthAppChanged ? null : existing?.metadata.connectedEmail ?? null,
    }
    const secrets: OAuthAppSecrets = {
      clientSecret,
      refreshToken: oauthAppChanged ? undefined : existing?.secrets.refreshToken,
    }
    const nextStatus: 'active' | 'invalid' =
      oauthAppChanged || !secrets.refreshToken ? 'invalid' : 'active'

    await this.upsertRow(userId, existing?.id ?? null, metadata, secrets, nextStatus)
    return { success: true, requiresReconnect: oauthAppChanged }
  }

  async clearApp(userId: string) {
    const existing = await this.findRow(userId)
    if (!existing) return { success: true }
    await this.prisma.userCredential.delete({ where: { id: existing.id } })
    return { success: true }
  }

  async getAuthUrl(userId: string) {
    const row = await this.findRow(userId)
    if (!row || !row.secrets.clientSecret) {
      throw new BadRequestException('Gmail OAuth 앱 설정이 등록되어 있지 않습니다. 먼저 OAuth 설정을 저장해 주세요.')
    }
    const stateRaw = JSON.stringify({ userId, scope: 'client-tool', ts: Date.now() })
    const state = Buffer.from(stateRaw, 'utf-8').toString('base64url')

    // login_hint: 이전에 연결됐던 Google 계정이 있으면 그걸 힌트로 사용 (재인증 시 같은 계정
    // 선택 편의). 시스템 로그인 이메일(User.email)은 Google 계정과 무관할 수 있으므로
    // (예: naver.com 으로 가입) 절대 힌트로 사용하지 않는다. 첫 연결이거나 disconnect 후엔
    // 힌트 없이 사용자가 자유롭게 어떤 Google 계정이든 선택.
    const loginHint = row.metadata.connectedEmail || undefined

    const params = new URLSearchParams({
      client_id: row.metadata.clientId,
      redirect_uri: row.metadata.redirectUri,
      response_type: 'code',
      scope: row.metadata.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      ...(loginHint ? { login_hint: loginHint } : {}),
    })
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
  }

  async exchangeCode(userId: string, code: string, state: string) {
    this.logger.log(`Gmail OAuth exchangeCode start (userId=${userId})`)
    const parsed = this.parseState(state)
    if (parsed.userId !== userId) {
      this.logger.warn(
        `Gmail OAuth state 불일치: state.userId=${parsed.userId} vs current=${userId}`,
      )
      throw new ForbiddenException('OAuth state does not match current user')
    }

    const row = await this.findRow(userId)
    if (!row || !row.secrets.clientSecret) {
      this.logger.warn(
        `Gmail OAuth: 앱 설정 없음 (userId=${userId}, hasRow=${!!row}, hasClientSecret=${!!row?.secrets.clientSecret})`,
      )
      throw new NotFoundException('Gmail OAuth 앱 설정이 없습니다.')
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: row.metadata.clientId,
        client_secret: row.secrets.clientSecret,
        redirect_uri: row.metadata.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>
    if (!tokenRes.ok) {
      const msg =
        (tokenJson.error_description as string | undefined) ||
        (tokenJson.error as string | undefined) ||
        'Token exchange failed'
      throw new BadRequestException(msg)
    }

    const refreshToken = tokenJson.refresh_token as string | undefined
    if (!refreshToken) {
      this.logger.warn(
        `Gmail OAuth: refresh_token 없음 (userId=${userId}, response=${JSON.stringify(tokenJson).slice(0, 200)})`,
      )
      throw new BadRequestException(
        'refresh_token이 발급되지 않았습니다. Google OAuth 설정에서 access_type=offline 및 prompt=consent가 필요합니다.',
      )
    }

    // 연결 직후 access_token 으로 Gmail profile 조회 → 실제 연결 계정 이메일 저장
    // (사용자가 어떤 Google 계정에 연결됐는지 UI 에 표시하고, 추후 login_hint 로도 활용)
    let connectedEmail: string | null = null
    const accessToken = tokenJson.access_token as string | undefined
    if (accessToken) {
      try {
        const profRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (profRes.ok) {
          const pj = (await profRes.json()) as { emailAddress?: string }
          if (typeof pj.emailAddress === 'string' && pj.emailAddress.trim()) {
            connectedEmail = pj.emailAddress.trim()
          }
        } else {
          this.logger.warn(
            `Gmail OAuth: profile 조회 실패 (userId=${userId}, status=${profRes.status}) — 연결 자체는 성공`,
          )
        }
      } catch (err) {
        this.logger.warn(
          `Gmail OAuth: profile 조회 예외 (userId=${userId}): ${err instanceof Error ? err.message : 'unknown'}`,
        )
      }
    }

    const metadata: OAuthAppMetadata = {
      ...row.metadata,
      connectedAt: new Date().toISOString(),
      connectedEmail,
    }
    const secrets: OAuthAppSecrets = { ...row.secrets, refreshToken }
    await this.upsertRow(userId, row.id, metadata, secrets, 'active')
    this.logger.log(
      `Gmail OAuth exchangeCode 성공 (userId=${userId}, clientId=${row.metadata.clientId}, connectedEmail=${connectedEmail ?? 'unknown'}, refreshTokenLen=${refreshToken.length})`,
    )
    return { connected: true, connectedEmail }
  }

  async disconnect(userId: string) {
    const existing = await this.findRow(userId)
    if (!existing) return { success: true }
    const metadata: OAuthAppMetadata = {
      ...existing.metadata,
      connectedAt: null,
      connectedEmail: null,
    }
    const secrets: OAuthAppSecrets = { clientSecret: existing.secrets.clientSecret }
    await this.upsertRow(userId, existing.id, metadata, secrets, 'invalid')
    return { success: true }
  }

  // ----------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------

  private async findRow(userId: string): Promise<GmailRowSnapshot | null> {
    const row = await this.prisma.userCredential.findFirst({
      where: { userId, kind: 'tool', targetId: GMAIL_TARGET_ID, label: OAUTH_APP_LABEL },
    })
    if (!row) return null
    let secrets: OAuthAppSecrets
    try {
      const plain = decryptCredential(row.valueEnc)
      secrets = JSON.parse(plain) as OAuthAppSecrets
    } catch {
      secrets = {}
    }
    const metadata = (row.metadata ?? {}) as unknown as OAuthAppMetadata
    return {
      id: row.id,
      metadata: {
        clientId: metadata.clientId ?? '',
        redirectUri: metadata.redirectUri ?? '',
        scopes: Array.isArray(metadata.scopes) && metadata.scopes.length > 0 ? metadata.scopes : DEFAULT_SCOPES,
        connectedAt: metadata.connectedAt ?? null,
        connectedEmail: metadata.connectedEmail ?? null,
      },
      secrets,
      status: row.status as 'active' | 'invalid' | 'expired',
      lastVerifiedAt: row.lastVerifiedAt,
    }
  }

  private async upsertRow(
    userId: string,
    existingId: string | null,
    metadata: OAuthAppMetadata,
    secrets: OAuthAppSecrets,
    status: 'active' | 'invalid' | 'expired',
  ) {
    const valueEnc = encryptCredential(JSON.stringify(secrets))
    if (existingId) {
      await this.prisma.userCredential.update({
        where: { id: existingId },
        data: {
          valueEnc,
          metadata: metadata as object,
          status,
          lastVerifiedAt: status === 'active' && secrets.refreshToken ? new Date() : null,
        },
      })
    } else {
      await this.prisma.userCredential.create({
        data: {
          userId,
          kind: 'tool',
          targetId: GMAIL_TARGET_ID,
          label: OAUTH_APP_LABEL,
          valueEnc,
          metadata: metadata as object,
          status,
          lastVerifiedAt: status === 'active' && secrets.refreshToken ? new Date() : null,
        },
      })
    }
  }

  private parseState(state: string): { userId: string; ts: number } {
    try {
      const raw = Buffer.from(state, 'base64url').toString('utf-8')
      const parsed = JSON.parse(raw) as { userId?: string; ts?: number }
      if (!parsed?.userId) throw new Error('invalid')
      return { userId: parsed.userId, ts: parsed.ts ?? 0 }
    } catch {
      throw new BadRequestException('Invalid OAuth state')
    }
  }
}
