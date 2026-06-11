import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger'
import { AgentsService } from './agents.service'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { CreateAgentRequest, UpdateAgentRequest } from '@agent-studio/shared'

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('projects/:projectId/agents')
export class AgentsController {
  constructor(private agentsService: AgentsService) {}

  @Post()
  @ApiOperation({ summary: '에이전트 생성' })
  create(
    @Param('projectId') projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAgentRequest,
  ) {
    return this.agentsService.create(projectId, userId, dto)
  }

  @Get()
  @ApiOperation({ summary: '에이전트 목록 조회' })
  list(@Param('projectId') projectId: string) {
    return this.agentsService.list(projectId)
  }
}

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentDetailController {
  constructor(private agentsService: AgentsService) {}

  @Get(':agentId')
  @ApiOperation({ summary: '에이전트 상세 조회' })
  get(@Param('agentId') agentId: string) {
    return this.agentsService.get(agentId)
  }

  @Patch(':agentId')
  @ApiOperation({ summary: '에이전트 수정' })
  update(
    @Param('agentId') agentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAgentRequest,
  ) {
    return this.agentsService.update(agentId, userId, dto)
  }

  @Delete(':agentId')
  @ApiOperation({ summary: '에이전트 삭제' })
  delete(@Param('agentId') agentId: string) {
    return this.agentsService.delete(agentId)
  }

  @Get(':agentId/prompt-versions')
  @ApiOperation({ summary: '프롬프트 버전 목록' })
  listPromptVersions(@Param('agentId') agentId: string) {
    return this.agentsService.listPromptVersions(agentId)
  }

  @Post(':agentId/prompt-versions')
  @ApiOperation({ summary: '프롬프트 버전 저장' })
  createPromptVersion(
    @Param('agentId') agentId: string,
    @Body() dto: { systemPrompt: string; label?: string; createdBy?: string },
  ) {
    return this.agentsService.createPromptVersion(agentId, dto)
  }

  @Post(':agentId/clone')
  @ApiOperation({ summary: '에이전트 복제' })
  @ApiResponse({ status: 201, description: '복제된 에이전트' })
  clone(@Param('agentId') agentId: string) {
    return this.agentsService.clone(agentId)
  }

  @Get(':agentId/export')
  @ApiOperation({ summary: '에이전트 설정 내보내기 (JSON)' })
  @ApiResponse({ status: 200, description: '에이전트 설정 JSON' })
  exportAgent(@Param('agentId') agentId: string) {
    return this.agentsService.exportAgent(agentId)
  }

  @Get(':agentId/schedules')
  @ApiOperation({ summary: '스케줄 목록 조회' })
  listSchedules(@Param('agentId') agentId: string) {
    return this.agentsService.listSchedules(agentId)
  }

  @Post(':agentId/schedules')
  @ApiOperation({ summary: '스케줄 추가' })
  createSchedule(
    @Param('agentId') agentId: string,
    @Body() dto: { name: string; cron: string; input: Record<string, unknown>; enabled?: boolean },
  ) {
    return this.agentsService.createSchedule(agentId, dto)
  }

  @Delete(':agentId/schedules/:scheduleId')
  @ApiOperation({ summary: '스케줄 삭제' })
  deleteSchedule(
    @Param('agentId') agentId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.agentsService.deleteSchedule(agentId, scheduleId)
  }

  @Post(':agentId/schedules/:scheduleId/run')
  @ApiOperation({ summary: '스케줄 즉시 실행' })
  runSchedule(
    @Param('agentId') agentId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.agentsService.runSchedule(agentId, scheduleId)
  }
}

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentImportController {
  constructor(private agentsService: AgentsService) {}

  @Post('import')
  @ApiOperation({ summary: 'JSON으로 에이전트 가져오기' })
  @ApiResponse({ status: 201, description: '가져온 에이전트' })
  importAgent(@Body() dto: { projectId: string; data: Record<string, unknown> }) {
    return this.agentsService.importAgent(dto.projectId, dto.data)
  }

  @Post('compare')
  @ApiOperation({ summary: '두 에이전트 A/B 비교 실행' })
  @ApiResponse({ status: 200 })
  compare(@Body() dto: { agentAId: string; agentBId: string; message: string }) {
    return this.agentsService.compare(dto.agentAId, dto.agentBId, dto.message)
  }
}
