import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { AgentDeploymentsService } from './agent-deployments.service'
import { CreateAgentDeploymentDto } from './dto/create-agent-deployment.dto'
import { IssueDeploymentApiKeyDto } from './dto/issue-api-key.dto'

@ApiTags('AgentDeployments')
@ApiBearerAuth()
@Controller()
export class AgentDeploymentsController {
  constructor(private readonly service: AgentDeploymentsService) {}

  @ApiOperation({ summary: 'Agent 배포 (snapshot 캡처 + version 자동 + publicPath 생성)' })
  @ApiResponse({ status: 201, description: '생성된 AgentDeployment 반환' })
  @Post('agents/:agentId/deployments')
  deploy(
    @Param('agentId') agentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAgentDeploymentDto,
  ) {
    return this.service.deploy(agentId, userId, dto)
  }

  @ApiOperation({ summary: 'Agent 의 배포 이력 조회' })
  @Get('agents/:agentId/deployments')
  listByAgent(@Param('agentId') agentId: string) {
    return this.service.listByAgent(agentId)
  }

  @ApiOperation({ summary: 'AgentDeployment 단건 조회' })
  @Get('agent-deployments/:id')
  get(@Param('id') id: string) {
    return this.service.get(id)
  }

  @ApiOperation({ summary: 'AgentDeployment 비활성화 (status=inactive)' })
  @Post('agent-deployments/:id/undeploy')
  undeploy(@Param('id') id: string) {
    return this.service.undeploy(id)
  }

  @ApiOperation({
    summary: 'AgentDeployment API Key 발급 (raw key 1회 응답)',
    description: '응답의 rawKey 는 다시 조회할 수 없으므로 즉시 사용자에게 전달해야 함.',
  })
  @ApiResponse({ status: 201, description: '발급된 API Key (rawKey 포함)' })
  @Post('agent-deployments/:id/api-keys')
  issueApiKey(
    @Param('id') id: string,
    @Body() dto: IssueDeploymentApiKeyDto,
  ) {
    return this.service.issueApiKey(id, dto)
  }

  @ApiOperation({ summary: 'AgentDeployment API Key 목록 (마스킹된 값만)' })
  @Get('agent-deployments/:id/api-keys')
  listApiKeys(@Param('id') id: string) {
    return this.service.listApiKeys(id)
  }

  @ApiOperation({ summary: 'API Key revoke (status=revoked, enabled=false)' })
  @Delete('api-keys/:keyId')
  revokeApiKey(@Param('keyId') keyId: string) {
    return this.service.revokeApiKey(keyId)
  }
}
