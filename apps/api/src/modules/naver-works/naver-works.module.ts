import { Module } from '@nestjs/common'
import { NaverWorksInstallationsController } from './naver-works-installations.controller'
import { NaverWorksWebhookController } from './naver-works-webhook.controller'
import { NaverWorksReplyController } from './naver-works-reply.controller'
import { NaverWorksInstallationsService } from './naver-works-installations.service'
import { NaverWorksDispatcherService } from './naver-works-dispatcher.service'
import { NaverWorksAuthService } from './naver-works-auth.service'
import { NaverWorksClient } from './naver-works-client.service'

@Module({
  controllers: [
    NaverWorksInstallationsController,
    NaverWorksWebhookController,
    NaverWorksReplyController,
  ],
  providers: [
    NaverWorksInstallationsService,
    NaverWorksDispatcherService,
    NaverWorksAuthService,
    NaverWorksClient,
  ],
})
export class NaverWorksModule {}
