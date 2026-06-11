import { Body, Controller, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { AgentAssistantService } from './agent-assistant.service'

class CreateAssistantSessionDto {
  @IsOptional()
  @IsString()
  model?: string
}

class InvokeAssistantDto {
  @IsString()
  message!: string
}

@ApiTags('AgentAssistant')
@ApiBearerAuth()
@Controller('agents/:agentId/assistant')
export class AgentAssistantController {
  constructor(private readonly service: AgentAssistantService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Agent Assistant 세션 생성' })
  createSession(
    @Param('agentId') agentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAssistantSessionDto,
  ) {
    return this.service.createSession(agentId, userId, dto.model)
  }

  @Post('sessions/:threadId/invoke')
  @ApiOperation({ summary: 'Agent Assistant 세션에 메시지 전송' })
  invoke(
    @Param('agentId') agentId: string,
    @Param('threadId') threadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InvokeAssistantDto,
  ) {
    return this.service.invoke(agentId, threadId, userId, dto.message)
  }
}
