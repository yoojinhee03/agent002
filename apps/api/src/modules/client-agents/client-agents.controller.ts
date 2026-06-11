import { Controller, Get, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { ClientAgentsService } from './client-agents.service'

@ApiTags('ClientAgents')
@ApiBearerAuth()
@Controller('client/agents')
export class ClientAgentsController {
  constructor(private readonly service: ClientAgentsService) {}

  @ApiOperation({ summary: '현재 사용자가 사용 가능한 활성 AgentDeployment 카드 목록 (composition 포함)' })
  @ApiResponse({ status: 200, description: 'ClientAgentCard[] — composition(메인/서브 에이전트 skill·tool) 포함' })
  @Get()
  list() {
    return this.service.listForUser()
  }

  @ApiOperation({ summary: 'agent slug 로 상세 조회 + 누락 자격증명 도출 + composition' })
  @ApiResponse({ status: 200, description: 'ClientAgentDetail (requiredCredentials/missingCredentials/composition 포함)' })
  @ApiResponse({ status: 404, description: '활성 배포 없음' })
  @Get(':slug')
  get(@CurrentUser('id') userId: string, @Param('slug') slug: string) {
    return this.service.getBySlug(userId, slug)
  }
}
