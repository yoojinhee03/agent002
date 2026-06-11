import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { GmailOAuthService } from './gmail-oauth.service'

@ApiTags('MeCredentials.Gmail')
@ApiBearerAuth()
@Controller('me/credentials/gmail')
export class GmailOAuthController {
  constructor(private readonly service: GmailOAuthService) {}

  @ApiOperation({ summary: '본인 Gmail OAuth 앱 설정 조회' })
  @Get('oauth-app')
  getApp(@CurrentUser('id') userId: string) {
    return this.service.getApp(userId)
  }

  @ApiOperation({ summary: 'Gmail OAuth 앱 설정 저장 (clientId/secret/redirectUri/scopes)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['clientId', 'redirectUri'],
      properties: {
        clientId: { type: 'string', example: 'xxx.apps.googleusercontent.com' },
        clientSecret: { type: 'string', example: 'GOCSPX-...', description: '저장된 값 유지하려면 생략' },
        redirectUri: { type: 'string', example: 'http://localhost:3001/client/oauth/google/callback' },
        scopes: { type: 'array', items: { type: 'string' }, example: ['https://www.googleapis.com/auth/gmail.readonly'] },
      },
    },
  })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @Put('oauth-app')
  saveApp(
    @CurrentUser('id') userId: string,
    @Body()
    body: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] },
  ) {
    return this.service.saveApp(userId, body)
  }

  @ApiOperation({ summary: 'Gmail OAuth 앱 설정 + refresh_token 모두 삭제' })
  @Delete('oauth-app')
  clearApp(@CurrentUser('id') userId: string) {
    return this.service.clearApp(userId)
  }

  @ApiOperation({ summary: 'Google OAuth 동의 URL 발급 (state 에 userId 인코딩)' })
  @Get('auth-url')
  authUrl(@CurrentUser('id') userId: string) {
    return this.service.getAuthUrl(userId)
  }

  @ApiOperation({ summary: 'OAuth callback — code + state → refresh_token 저장' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'state'],
      properties: {
        code: { type: 'string', example: '4/0Adeu5BW...', description: 'Google authorization code' },
        state: { type: 'string', description: 'auth-url 발급 시 받은 state' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '{ connected: true }' })
  @ApiResponse({ status: 400, description: 'oauth_state_mismatch' })
  @Post('callback')
  callback(
    @CurrentUser('id') userId: string,
    @Body() body: { code: string; state: string },
  ) {
    return this.service.exchangeCode(userId, body.code, body.state)
  }

  @ApiOperation({ summary: '연동 해제 — refresh_token 만 제거 (앱 설정은 유지)' })
  @Post('disconnect')
  disconnect(@CurrentUser('id') userId: string) {
    return this.service.disconnect(userId)
  }
}
