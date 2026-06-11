import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { HitlService } from './hitl.service'

@ApiTags('HITL')
@ApiBearerAuth()
@Controller()
export class HitlController {
  constructor(private hitlService: HitlService) {}

  @Get('projects/:projectId/interactions')
  @ApiOperation({ summary: '대기 중인 HITL 상호작용 목록' })
  listPending(@Param('projectId') projectId: string) {
    return this.hitlService.listPending(projectId)
  }

  @Get('threads/:threadId/interactions')
  @ApiOperation({ summary: '특정 thread 의 HITL 상호작용 목록 (히스토리 복원용)' })
  listByThread(@Param('threadId') threadId: string) {
    return this.hitlService.listByThread(threadId)
  }

  @Get('interactions/:id')
  @ApiOperation({ summary: 'HITL 상호작용 상세 조회' })
  get(@Param('id') id: string) {
    return this.hitlService.get(id)
  }

  @Post('interactions/:id/respond')
  @ApiOperation({
    summary: 'HITL 상호작용에 응답',
    description:
      'source: "studio" | "client" — 초기 invoke 와 동일한 자격증명 소스를 사용하도록 분기 정보를 전달.',
  })
  respond(
    @Param('id') id: string,
    @Body()
    body: {
      response: unknown
      userId?: string
      source?: 'studio' | 'client'
    },
  ) {
    const source: 'studio' | 'client' | undefined =
      body.source === 'studio' || body.source === 'client' ? body.source : undefined
    return this.hitlService.respond(id, body.response, body.userId || 'anonymous', source)
  }

  @Post('interactions/:id/preview-edit')
  @ApiOperation({
    summary: '자연어 수정문을 새 args 로 변환 (LLM) — deepagents 상태 미변경',
  })
  previewEdit(@Param('id') id: string, @Body() body: { editPrompt: string }) {
    return this.hitlService.previewEdit(id, body.editPrompt)
  }

  @Post('interactions/:id/escalate')
  @ApiOperation({ summary: 'HITL 상호작용 에스컬레이션' })
  escalate(
    @Param('id') id: string,
    @Body() body: { escalateTo: string },
  ) {
    return this.hitlService.escalate(id, body.escalateTo)
  }
}
