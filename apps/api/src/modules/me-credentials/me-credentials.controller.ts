import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CreateCredentialDto } from './dto/create-credential.dto'
import { UpdateCredentialDto } from './dto/update-credential.dto'
import { MeCredentialsService } from './me-credentials.service'

type Kind = 'provider' | 'tool' | 'mcp'

@ApiTags('MeCredentials')
@ApiBearerAuth()
@Controller('me/credentials')
export class MeCredentialsController {
  constructor(private readonly service: MeCredentialsService) {}

  @ApiOperation({ summary: '본인 자격증명 마스킹 목록' })
  @ApiQuery({ name: 'kind', required: false, enum: ['provider', 'tool', 'mcp'] })
  @Get()
  list(@CurrentUser('id') userId: string, @Query('kind') kind?: Kind) {
    return this.service.list(userId, kind)
  }

  @ApiOperation({ summary: '자격증명 등록 — value 는 1회만 평문 전달, 이후 조회 불가' })
  @ApiResponse({ status: 201, description: '마스킹된 자격증명 객체' })
  @ApiResponse({ status: 409, description: '동일 (kind+targetId+label) 중복' })
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCredentialDto) {
    return this.service.create(userId, dto)
  }

  @ApiOperation({ summary: '자격증명 라벨/값/metadata 변경' })
  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCredentialDto,
  ) {
    return this.service.update(userId, id, dto)
  }

  @ApiOperation({ summary: '자격증명 삭제' })
  @Delete(':id')
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.delete(userId, id)
  }

  @ApiOperation({
    summary: '자격증명 실 검증 — provider:openai/anthropic 은 ping, 그 외는 형식 sanity',
  })
  @Post(':id/test')
  test(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.test(userId, id)
  }
}
