import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator'
import { CreatePublicThreadDto } from './dto/create-public-thread.dto'
import { InvokeMessageDto } from './dto/invoke-message.dto'
import { ResumeMessageDto } from './dto/resume-message.dto'
import { PublicChatService } from './public-chat.service'

interface RequestWithDeployment {
  agentDeployment?: { id: string; projectId: string; agentId: string }
}

@ApiTags('PublicChat')
@ApiSecurity('X-API-Key')
@ApiKeyAuth()
@Controller('v1/chat')
export class PublicChatController {
  constructor(private readonly service: PublicChatService) {}

  @ApiOperation({ summary: '외부 client thread 생성 (X-API-Key 의 deployment 기준)' })
  @ApiResponse({ status: 201, description: '생성된 thread {id, status, title, createdAt}' })
  @Post('threads')
  createThread(@Req() req: RequestWithDeployment, @Body() dto: CreatePublicThreadDto) {
    if (!req.agentDeployment) {
      throw new Error('agentDeployment missing — ApiKeyGuard not applied')
    }
    return this.service.createThread(req.agentDeployment, dto?.title, dto?.metadata)
  }

  @ApiOperation({ summary: '메시지 전송 + 즉시 응답 (runner 프록시)' })
  @Post('threads/:threadId/messages')
  invoke(
    @Req() req: RequestWithDeployment,
    @Param('threadId') threadId: string,
    @Body() dto: InvokeMessageDto,
  ) {
    if (!req.agentDeployment) {
      throw new Error('agentDeployment missing — ApiKeyGuard not applied')
    }
    return this.service.invoke(threadId, req.agentDeployment.id, dto.message)
  }

  @ApiOperation({ summary: 'HITL 응답 (decisions: deepagents 포맷)' })
  @Post('threads/:threadId/resume')
  resume(
    @Req() req: RequestWithDeployment,
    @Param('threadId') threadId: string,
    @Body() dto: ResumeMessageDto,
  ) {
    if (!req.agentDeployment) {
      throw new Error('agentDeployment missing — ApiKeyGuard not applied')
    }
    return this.service.resume(threadId, req.agentDeployment.id, dto.decisions)
  }

  @ApiOperation({ summary: 'thread 메시지 이력 조회 (runner 프록시)' })
  @Get('threads/:threadId/messages')
  getMessages(@Req() req: RequestWithDeployment, @Param('threadId') threadId: string) {
    if (!req.agentDeployment) {
      throw new Error('agentDeployment missing — ApiKeyGuard not applied')
    }
    return this.service.getMessages(threadId, req.agentDeployment.id)
  }
}
