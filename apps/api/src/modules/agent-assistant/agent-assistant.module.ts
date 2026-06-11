import { Module } from '@nestjs/common'
import { AgentAssistantController } from './agent-assistant.controller'
import { AgentAssistantService } from './agent-assistant.service'

@Module({
  controllers: [AgentAssistantController],
  providers: [AgentAssistantService],
})
export class AgentAssistantModule {}
