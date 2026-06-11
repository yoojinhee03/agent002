import { Module } from '@nestjs/common'
import { AgentDeploymentsController } from './agent-deployments.controller'
import { AgentDeploymentsService } from './agent-deployments.service'

@Module({
  controllers: [AgentDeploymentsController],
  providers: [AgentDeploymentsService],
  exports: [AgentDeploymentsService],
})
export class AgentDeploymentsModule {}
