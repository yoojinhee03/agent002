import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { createHmac, timingSafeEqual } from 'crypto'
import { Public } from '../auth/decorators/public.decorator'
import { NaverWorksInstallationsService } from './naver-works-installations.service'
import {
  NaverWorksDispatcherService,
  type NaverWorksMessagePayload,
} from './naver-works-dispatcher.service'

interface NaverWorksCallback {
  type: string
  source?: {
    userId?: string
    channelId?: string | null
    domainId?: number
  }
  issuedTime?: string
  content?: { type?: string; text?: string; [k: string]: unknown }
  [k: string]: unknown
}

function verifySignature(botSecret: string, rawBody: Buffer, headerSig: string): boolean {
  if (!headerSig) return false
  const digest = createHmac('sha256', botSecret).update(rawBody).digest()
  const expected = Buffer.from(digest.toString('base64'))
  const provided = Buffer.from(headerSig)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

@ApiTags('NaverWorks.Webhook')
@Controller('webhooks/naver-works')
export class NaverWorksWebhookController {
  private readonly logger = new Logger(NaverWorksWebhookController.name)

  constructor(
    private readonly installationsService: NaverWorksInstallationsService,
    private readonly dispatcherService: NaverWorksDispatcherService,
  ) {}

  @Public()
  @Post(':botId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'NAVER WORKS Bot callback 수신 (1:1 message 만 처리)',
    description:
      'X-WORKS-Signature(HMAC-SHA256 of raw body with bot secret) 검증 후 즉시 200 응답. 1:1(channelId 없음) message 이벤트는 dispatcher 로 비동기 위임.',
  })
  @ApiResponse({ status: 200, description: '수신 완료' })
  @ApiResponse({ status: 401, description: '서명 검증 실패' })
  async handle(
    @Param('botId') botId: string,
    @Headers('x-works-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: boolean }> {
    const rawBody =
      req.rawBody ?? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}))

    const installation = await this.installationsService.getDecryptedByBotId(botId)
    if (!installation) {
      // 등록되지 않은/비활성화된 봇 — 서명 정보를 노출하지 않기 위해 동일하게 401 로 응답
      throw new UnauthorizedException('invalid signature')
    }

    if (!verifySignature(installation.botSecret, rawBody, signature ?? '')) {
      throw new UnauthorizedException('invalid signature')
    }

    // 200 응답을 막지 않기 위해 dispatch 는 setImmediate 로 비동기 위임
    let payload: NaverWorksCallback
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as NaverWorksCallback
    } catch (err) {
      this.logger.warn(
        `callback body JSON 파싱 실패 (botId=${botId}): ${err instanceof Error ? err.message : String(err)}`,
      )
      return { ok: true }
    }

    if (payload.type !== 'message') {
      this.logger.debug(`callback ${payload.type} 무시 (botId=${botId})`)
      return { ok: true }
    }

    const channelId = payload.source?.channelId
    if (channelId) {
      this.logger.debug(`채널 메시지 무시 — 1:1 만 처리 (botId=${botId}, channelId=${channelId})`)
      return { ok: true }
    }

    if (!payload.source?.userId) {
      return { ok: true }
    }

    setImmediate(() => {
      void this.dispatcherService
        .handle(installation, payload as NaverWorksMessagePayload)
        .catch((err) =>
          this.logger.error(
            `dispatcher 처리 실패 (botId=${botId}): ${err instanceof Error ? err.message : String(err)}`,
          ),
        )
    })

    return { ok: true }
  }
}
