import { Module } from '@nestjs/common'
import { GmailOAuthController } from './gmail-oauth.controller'
import { GmailOAuthService } from './gmail-oauth.service'
import { MeCredentialsController } from './me-credentials.controller'
import { MeCredentialsService } from './me-credentials.service'

@Module({
  controllers: [MeCredentialsController, GmailOAuthController],
  providers: [MeCredentialsService, GmailOAuthService],
  exports: [MeCredentialsService, GmailOAuthService],
})
export class MeCredentialsModule {}
