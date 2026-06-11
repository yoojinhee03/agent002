import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common'
import { createSign } from 'crypto'

interface CachedToken {
  token: string
  expiresAt: number
}

interface IssueTokenInput {
  clientId: string
  clientSecret: string
  serviceAccount: string
  privateKeyPem: string
  scope: string
}

interface IssueTokenResult {
  accessToken: string
  expiresInSec: number
}

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token'
const GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
const REFRESH_SKEW_SEC = 60

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** RS256 JWT 직접 서명 — iat/exp 는 호출자가 매번 새로 채워 넣는다. */
function signJwtRS256(claims: Record<string, unknown>, privateKeyPem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(claims))
  const signingInput = `${headerB64}.${payloadB64}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const sig = signer.sign(privateKeyPem)
  return `${signingInput}.${base64url(sig)}`
}

@Injectable()
export class NaverWorksAuthService {
  private readonly logger = new Logger(NaverWorksAuthService.name)
  private readonly cache = new Map<string, CachedToken>()

  /**
   * botId 키로 토큰 캐시. 만료 60초 전부터는 새로 발급한다.
   * iat/exp 는 호출 시점마다 재계산해 시계 드리프트로 인한 거부를 방지한다.
   */
  async getAccessToken(input: IssueTokenInput & { botId: string }): Promise<string> {
    const cached = this.cache.get(input.botId)
    const now = Math.floor(Date.now() / 1000)
    if (cached && cached.expiresAt - REFRESH_SKEW_SEC > now) {
      return cached.token
    }

    const issued = await this.issueToken(input)
    this.cache.set(input.botId, {
      token: issued.accessToken,
      expiresAt: now + issued.expiresInSec,
    })
    return issued.accessToken
  }

  /** 등록 시 자격증명 검증용 1회 발급. 캐시에 저장. */
  async verifyAndCache(input: IssueTokenInput & { botId: string }): Promise<void> {
    const issued = await this.issueToken(input)
    const now = Math.floor(Date.now() / 1000)
    this.cache.set(input.botId, {
      token: issued.accessToken,
      expiresAt: now + issued.expiresInSec,
    })
  }

  invalidate(botId: string): void {
    this.cache.delete(botId)
  }

  private async issueToken(input: IssueTokenInput): Promise<IssueTokenResult> {
    const now = Math.floor(Date.now() / 1000)
    let assertion: string
    try {
      assertion = signJwtRS256(
        {
          iss: input.clientId,
          sub: input.serviceAccount,
          iat: now,
          exp: now + 3600,
        },
        input.privateKeyPem,
      )
    } catch (err) {
      throw new UnprocessableEntityException(
        `JWT 서명 실패 (private key 형식 오류 가능성): ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const body = new URLSearchParams({
      grant_type: GRANT,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      assertion,
      scope: input.scope,
    })

    let res: Response
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (err) {
      throw new UnprocessableEntityException(
        `NAVER WORKS 토큰 발급 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new UnprocessableEntityException(
        `NAVER WORKS 토큰 발급 실패 HTTP ${res.status}: ${text.slice(0, 300)}`,
      )
    }

    const data = (await res.json()) as {
      access_token?: string
      expires_in?: number | string
      token_type?: string
      scope?: string
    }
    if (!data.access_token) {
      throw new UnprocessableEntityException('NAVER WORKS 토큰 응답에 access_token 없음')
    }
    const expiresInSec =
      typeof data.expires_in === 'string' ? parseInt(data.expires_in, 10) : (data.expires_in ?? 3600)
    return {
      accessToken: data.access_token,
      expiresInSec: Number.isFinite(expiresInSec) ? expiresInSec : 3600,
    }
  }
}
