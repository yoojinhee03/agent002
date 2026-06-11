import { Module } from '@nestjs/common'
import { ClientAgentsController } from './client-agents.controller'
import { ClientAgentsService } from './client-agents.service'

@Module({
  controllers: [ClientAgentsController],
  providers: [ClientAgentsService],
  exports: [ClientAgentsService],
})
export class ClientAgentsModule {}
