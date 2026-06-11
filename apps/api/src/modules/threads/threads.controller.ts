import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, HttpCode, HttpStatus, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import type { Response } from 'express'
import { ThreadsService } from './threads.service'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { CreateThreadRequest, ThreadStatus } from '@agent-studio/shared'

@ApiTags('Threads')
@ApiBearerAuth()
@Controller('projects/:projectId/threads')
export class ThreadsController {
  constructor(private threadsService: ThreadsService) {}

  @Post()
  @ApiOperation({ summary: '새 대화 스레드 시작' })
  @ApiParam({ name: 'projectId', description: 'Project UUID 또는 slug' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', nullable: true },
        teamId: { type: 'string', format: 'uuid', nullable: true },
        title: { type: 'string', nullable: true, example: 'deep-agent 대화' },
        metadata: { type: 'object', additionalProperties: true, nullable: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Thread 생성됨' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateThreadRequest,
    @Req() req: { user?: { id: string } },
  ) {
    return this.threadsService.create(projectId, req.user?.id || '', dto)
  }

  @Get()
  @ApiOperation({ summary: '스레드 목록 조회' })
  @ApiParam({ name: 'projectId', description: 'Project UUID 또는 slug' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'paused', 'completed', 'failed', 'archived'],
    description: '미지정 시 전체. Client 사이드바는 항상 active.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: '(Thread & { agent?, team?, _count })[]' })
  list(
    @Param('projectId') projectId: string,
    @Query('status') status?: ThreadStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.threadsService.list(projectId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })
  }
}

@ApiTags('Threads')
@ApiBearerAuth()
@Controller('threads')
export class ThreadDetailController {
  constructor(private threadsService: ThreadsService) {}

  @Get(':threadId')
  @ApiOperation({ summary: '스레드 상세 조회 (메시지 포함)' })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Thread + interactions + agent/team' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  get(@Param('threadId') threadId: string) {
    return this.threadsService.get(threadId)
  }

  @Patch(':threadId')
  @ApiOperation({
    summary: '스레드 메타 업데이트(title)',
    description: 'Client UI 의 ClientChatView 가 첫 사용자 메시지 첫 40자로 호출.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200, example: '최신 메일 알려줘' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '업데이트된 Thread' })
  update(
    @Param('threadId') threadId: string,
    @Body() body: { title?: string },
  ) {
    return this.threadsService.update(threadId, body)
  }

  @Delete(':threadId')
  @ApiOperation({
    summary: '스레드 아카이브 (soft-delete)',
    description: 'status 를 archived 로 전환. status=active 필터에서 제외됨.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  archive(@Param('threadId') threadId: string) {
    return this.threadsService.archive(threadId)
  }

  @Post(':threadId/invoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '에이전트 메시지 전송 (runner 프록시)',
    description:
      'source: "studio" (admin 페이지 chat → 프로젝트 OAuth) | "client" (client 페이지 chat → 사용자 OAuth). ' +
      '미지정 시 기존 동작 (userId 있으면 user 우선, 없으면 프로젝트 폴백).',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', example: '최신 메일 알려줘' },
        architectureOverride: { type: 'string', example: 'plan_execute' },
        source: { type: 'string', enum: ['studio', 'client'] },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'runner raw 응답 — 보통 { messages: ThreadMessage[] }',
  })
  @ApiResponse({ status: 502, description: 'Runner 호출 실패' })
  invoke(
    @Param('threadId') threadId: string,
    @Body()
    body: {
      content: string
      architectureOverride?: string
      source?: 'studio' | 'client'
    },
    @CurrentUser('id') userId: string,
  ) {
    const source: 'studio' | 'client' | undefined =
      body.source === 'studio' || body.source === 'client' ? body.source : undefined
    return this.threadsService.invoke(
      threadId,
      body.content,
      userId,
      body.architectureOverride,
      source,
    )
  }

  @Post(':threadId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'HITL 승인/거절 (runner 프록시)',
    description: 'source 는 invoke 와 동일 의미. resume 시 같은 자격증명 소스 유지.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['approved'],
      properties: {
        approved: { type: 'boolean' },
        source: { type: 'string', enum: ['studio', 'client'] },
      },
    },
  })
  resume(
    @Param('threadId') threadId: string,
    @Body() body: { approved: boolean; source?: 'studio' | 'client' },
    @CurrentUser('id') userId: string,
  ) {
    const source: 'studio' | 'client' | undefined =
      body.source === 'studio' || body.source === 'client' ? body.source : undefined
    return this.threadsService.resume(threadId, body.approved, userId, source)
  }

  @Post(':threadId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '진행 중인 invoke 중지 (runner 프록시)',
    description: '현재 thread 에서 실행 중인 task 를 cancel. 등록 없으면 cancelled=false.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: '{ threadId: string, cancelled: boolean }',
  })
  cancel(@Param('threadId') threadId: string) {
    return this.threadsService.cancel(threadId)
  }

  @Get(':threadId/messages')
  @ApiOperation({ summary: '스레드 메시지 목록 (runner 프록시)' })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'ThreadMessage[] — { role, content, toolCalls?, timestamp, metadata? }[]',
  })
  getMessages(@Param('threadId') threadId: string) {
    return this.threadsService.getMessages(threadId)
  }

  @Post(':threadId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: '스레드 첨부 업로드 (runner 프록시)',
    description:
      'multipart/form-data 로 단일 파일 업로드. runner 가 디스크에 저장하고 thread_attachments DB row 생성. 에이전트는 다음 turn 직전 sandbox /workspace/<originalName> 으로 자동 sync.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'ThreadAttachment metadata' })
  uploadAttachment(
    @Param('threadId') threadId: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.uploadAttachment(threadId, file, userId)
  }

  @Get(':threadId/attachments')
  @ApiOperation({ summary: '스레드 첨부 목록 (runner 프록시)' })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'ThreadAttachment[]' })
  listAttachments(@Param('threadId') threadId: string) {
    return this.threadsService.listAttachments(threadId)
  }

  @Get(':threadId/runs')
  @ApiOperation({
    summary: '스레드 run + step trace 시간순 조회 (runner 프록시)',
    description:
      'history 진입 시 step trace 카드(`group`)를 복원하기 위한 데이터. 각 run 은 turn 1회에 해당하며 내부에 step 들이 시간순 정렬되어 있다.',
  })
  @ApiParam({ name: 'threadId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description:
      'Array<{ runId, status, startedAt, completedAt, latencyMs, steps: Array<{ stepId, parentStepId, depth, name, stepType, status, latencyMs, startedAt, completedAt }> }>',
  })
  getRuns(@Param('threadId') threadId: string) {
    return this.threadsService.getRuns(threadId)
  }
}

@ApiTags('Threads')
@ApiBearerAuth()
@Controller('thread-attachments')
export class ThreadAttachmentController {
  constructor(private threadsService: ThreadsService) {}

  @Get(':attachmentId/content')
  @ApiOperation({ summary: '첨부 다운로드 (runner 프록시)' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  async download(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { body, contentType, filename } = await this.threadsService.downloadAttachment(attachmentId)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(body))
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '첨부 삭제 (runner 프록시)' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  delete(@Param('attachmentId') attachmentId: string) {
    return this.threadsService.deleteAttachment(attachmentId)
  }
}
