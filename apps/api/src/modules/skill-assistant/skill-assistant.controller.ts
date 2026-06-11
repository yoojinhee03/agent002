import { Body, Controller, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { SkillAssistantService } from './skill-assistant.service'

export class CreateSkillAssistantSessionDto {
  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsString()
  skillId?: string

  @IsOptional()
  @IsIn(['auto', 'builder', 'analyze'])
  mode?: string
}

export class InvokeSkillAssistantDto {
  @IsString()
  message!: string

  @IsOptional()
  @IsIn(['auto', 'builder', 'analyze'])
  mode?: string
}

@ApiTags('SkillAssistant')
@ApiBearerAuth()
@Controller('skills/assistant')
export class SkillAssistantController {
  constructor(private readonly service: SkillAssistantService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Skill Assistant 세션 생성' })
  createSession(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSkillAssistantSessionDto,
  ) {
    return this.service.createSession(userId, dto.model, dto.skillId, dto.mode)
  }

  @Post('sessions/:threadId/invoke')
  @ApiOperation({ summary: 'Skill Assistant 세션에 메시지 전송' })
  invoke(
    @Param('threadId') threadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InvokeSkillAssistantDto,
  ) {
    return this.service.invoke(threadId, userId, dto.message, dto.mode)
  }
}
