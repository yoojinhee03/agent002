import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { AddProviderDto } from './dto/add-provider.dto'
import { MeProvidersService } from './me-providers.service'

@ApiTags('MeProviders')
@ApiBearerAuth()
@Controller('me/providers')
export class MeProvidersController {
  constructor(private readonly service: MeProvidersService) {}

  @ApiOperation({ summary: '시스템 Provider 카탈로그 + 본인 보유 여부' })
  @ApiResponse({ status: 200, description: 'Provider[] (owned, userCredentials 포함)' })
  @Get()
  catalog(@CurrentUser('id') userId: string) {
    return this.service.catalog(userId)
  }

  @ApiOperation({
    summary: '본인 Provider 자격증명 등록 (UserCredential(kind=provider) 생성)',
  })
  @ApiResponse({ status: 201, description: '생성된 자격증명 + provider 메타' })
  @ApiResponse({ status: 409, description: '동일 provider+label 중복' })
  @Post()
  add(@CurrentUser('id') userId: string, @Body() dto: AddProviderDto) {
    return this.service.addProvider(userId, dto)
  }
}
