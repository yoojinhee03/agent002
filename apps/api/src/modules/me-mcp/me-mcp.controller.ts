import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { MeMcpService } from './me-mcp.service'

@ApiTags('MeMcp')
@ApiBearerAuth()
@Controller('me/mcp')
export class MeMcpController {
  constructor(private readonly service: MeMcpService) {}

  @ApiOperation({ summary: 'MCP 서버 자격증명 카탈로그 + 본인 보유 여부' })
  @ApiResponse({ status: 200, description: 'McpCredentialCatalog[]' })
  @Get()
  catalog(@CurrentUser('id') userId: string) {
    return this.service.catalog(userId)
  }
}
