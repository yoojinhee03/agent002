import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../auth/decorators/roles.decorator'
import { SlackChannelAgentsService } from './slack-channel-agents.service'
import { CreateChannelAgentDto } from './dto/create-channel-agent.dto'
import { UpdateChannelAgentDto } from './dto/update-channel-agent.dto'

@ApiTags('Slack')
@ApiBearerAuth()
@Roles('admin')
@Controller('slack/channel-agents')
export class SlackChannelAgentsController {
  constructor(private readonly service: SlackChannelAgentsService) {}

  @Get()
  @ApiOperation({ summary: '채널-Agent 매핑 목록 조회 (Agent 이름 포함)' })
  @ApiResponse({ status: 200, description: '매핑 목록' })
  list(@Query('projectId') projectId: string) {
    return this.service.list(projectId)
  }

  @Post()
  @ApiOperation({ summary: '채널-Agent 매핑 생성' })
  @ApiResponse({ status: 201, description: '생성된 매핑' })
  @ApiResponse({ status: 409, description: '동일 채널+모드 조합 중복' })
  @ApiResponse({ status: 422, description: 'Slack 설치 없음 또는 Agent 미존재' })
  create(@Query('projectId') projectId: string, @Body() dto: CreateChannelAgentDto) {
    return this.service.create(projectId, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '채널-Agent 매핑 수정 (mode / enabled)' })
  @ApiResponse({ status: 200, description: '갱신된 매핑' })
  update(@Param('id') id: string, @Body() dto: UpdateChannelAgentDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '채널-Agent 매핑 삭제' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id)
    return { deleted: true }
  }
}
