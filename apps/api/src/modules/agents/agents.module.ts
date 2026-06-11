import { Module } from '@nestjs/common'
import { AgentsService } from './agents.service'
import { AgentsController, AgentDetailController, AgentImportController } from './agents.controller'

@Module({
  controllers: [AgentsController, AgentDetailController, AgentImportController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
