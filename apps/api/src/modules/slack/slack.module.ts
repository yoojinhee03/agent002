import { Module } from '@nestjs/common'
import { SlackInstallationsController } from './slack-installations.controller'
import { SlackChannelAgentsController } from './slack-channel-agents.controller'
import { SlackInstallationsService } from './slack-installations.service'
import { SlackChannelAgentsService } from './slack-channel-agents.service'
import { SlackRuntimeService } from './slack-runtime.service'

@Module({
  controllers: [SlackInstallationsController, SlackChannelAgentsController],
  providers: [SlackInstallationsService, SlackChannelAgentsService, SlackRuntimeService],
})
export class SlackModule {}
