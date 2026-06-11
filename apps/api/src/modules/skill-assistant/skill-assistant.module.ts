import { Module } from '@nestjs/common'
import { SkillAssistantController } from './skill-assistant.controller'
import { SkillAssistantService } from './skill-assistant.service'

@Module({
  controllers: [SkillAssistantController],
  providers: [SkillAssistantService],
})
export class SkillAssistantModule {}
