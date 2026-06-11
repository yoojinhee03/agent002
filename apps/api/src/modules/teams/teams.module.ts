import { Module } from '@nestjs/common'
import { TeamsService } from './teams.service'
import { TeamsController, TeamDetailController } from './teams.controller'

@Module({
  controllers: [TeamsController, TeamDetailController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
