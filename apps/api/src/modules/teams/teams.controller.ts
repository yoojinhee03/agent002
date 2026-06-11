import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { TeamsService } from './teams.service'
import type { CreateTeamRequest, UpdateTeamRequest, AddTeamAgentRequest, AddSubTeamRequest } from '@agent-studio/shared'

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('projects/:projectId/teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  @ApiOperation({ summary: '에이전트 팀 생성' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTeamRequest,
  ) {
    return this.teamsService.create(projectId, dto)
  }

  @Get()
  @ApiOperation({ summary: '에이전트 팀 목록 조회' })
  list(@Param('projectId') projectId: string) {
    return this.teamsService.list(projectId)
  }
}

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamDetailController {
  constructor(private teamsService: TeamsService) {}

  @Get(':teamId')
  @ApiOperation({ summary: '팀 상세 조회' })
  get(@Param('teamId') teamId: string) {
    return this.teamsService.get(teamId)
  }

  @Patch(':teamId')
  @ApiOperation({ summary: '팀 수정' })
  update(
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamRequest,
  ) {
    return this.teamsService.update(teamId, dto)
  }

  @Delete(':teamId')
  @ApiOperation({ summary: '팀 삭제' })
  delete(@Param('teamId') teamId: string) {
    return this.teamsService.delete(teamId)
  }

  @Post(':teamId/agents')
  @ApiOperation({ summary: '팀에 에이전트 추가' })
  addAgent(
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamAgentRequest,
  ) {
    return this.teamsService.addAgent(teamId, dto)
  }

  @Delete(':teamId/agents/:agentId')
  @ApiOperation({ summary: '팀에서 에이전트 제거' })
  removeAgent(
    @Param('teamId') teamId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.teamsService.removeAgent(teamId, agentId)
  }

  @Post(':teamId/subteams')
  @ApiOperation({ summary: '팀에 서브팀 추가 (Nested Team)' })
  addSubTeam(
    @Param('teamId') teamId: string,
    @Body() dto: AddSubTeamRequest,
  ) {
    return this.teamsService.addSubTeam(teamId, dto)
  }

  @Delete(':teamId/subteams/:subTeamId')
  @ApiOperation({ summary: '팀에서 서브팀 제거' })
  removeSubTeam(
    @Param('teamId') teamId: string,
    @Param('subTeamId') subTeamId: string,
  ) {
    return this.teamsService.removeSubTeam(teamId, subTeamId)
  }

  @Post(':teamId/invoke')
  @ApiOperation({ summary: '팀 실행 (Playground 용 stub)' })
  invoke(
    @Param('teamId') teamId: string,
    @Body() dto: { message: string },
  ) {
    return this.teamsService.invokeStub(teamId, dto.message)
  }
}
