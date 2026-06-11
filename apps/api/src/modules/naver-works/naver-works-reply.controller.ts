import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { NaverWorksAuthService } from './naver-works-auth.service'
import { NaverWorksClient } from './naver-works-client.service'
import { NaverWorksInstallationsService } from './naver-works-installations.service'
import { buildTextContents } from './naver-works-content.util'
import { NaverWorksReplyDto } from './dto/reply.dto'

/**
 * 내부 endpoint — Runner-py 가 에이전트 응답을 NAVER WORKS 사용자에게 push 할 때 호출.
 * 인증: `X-RUNNER-KEY` 헤더가 `RUNNER_INTERNAL_KEY` 와 일치해야 함.
 */
@ApiTags('NaverWorks.Internal')
@Controller('internal/naver-works')
export class NaverWorksReplyController {
  private readonly logger = new Logger(NaverWorksReplyController.name)

  constructor(
    private readonly installationsService: NaverWorksInstallationsService,
    private readonly authService: NaverWorksAuthService,
    private readonly client: NaverWorksClient,
  ) {}

  @Public()
  @Post('reply')
  @HttpCode(200)
  @ApiOperation({ summary: '에이전트 응답을 NAVER WORKS 사용자에게 push (1:1)' })
  @ApiResponse({ status: 200, description: '전송 완료' })
  @ApiResponse({ status: 401, description: 'X-RUNNER-KEY 불일치' })
  async reply(
    @Headers('x-runner-key') runnerKey: string,
    @Body() dto: NaverWorksReplyDto,
  ): Promise<{ sent: boolean }> {
    const expectedKey = process.env.RUNNER_INTERNAL_KEY ?? 'internal-service-key'
    if (!runnerKey || runnerKey !== expectedKey) {
      throw new UnauthorizedException('invalid runner key')
    }

    const installation = await this.installationsService.getDecryptedByBotId(dto.botId)
    if (!installation) {
      this.logger.warn(`reply: installation not found or disabled (botId=${dto.botId})`)
      return { sent: false }
    }

    const accessToken = await this.authService.getAccessToken({
      botId: installation.botId,
      clientId: installation.clientId,
      clientSecret: installation.clientSecret,
      serviceAccount: installation.serviceAccount,
      privateKeyPem: installation.privateKeyPem,
      scope: installation.scope,
    })

    const contents = buildTextContents(dto.text)
    await this.client.sendUserMessages({
      botId: installation.botId,
      accessToken,
      naverUserId: dto.naverUserId,
      contents,
    })
    return { sent: true }
  }
}
