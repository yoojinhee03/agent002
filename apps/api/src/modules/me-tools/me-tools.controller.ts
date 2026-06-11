import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { MeToolsService } from './me-tools.service'

@ApiTags('MeTools')
@ApiBearerAuth()
@Controller('me/tools')
export class MeToolsController {
  constructor(private readonly service: MeToolsService) {}

  @ApiOperation({ summary: '도구 자격증명 카탈로그 + 본인 보유 여부' })
  @ApiResponse({ status: 200, description: 'ToolCredentialCatalog[]' })
  @Get()
  catalog(@CurrentUser('id') userId: string) {
    return this.service.catalog(userId)
  }
}
