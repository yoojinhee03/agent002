import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CardsService, CardDefinitionDto, CardCategory } from './cards.service'

@ApiTags('Cards')
@ApiBearerAuth()
@Controller('cards')
export class CardsController {
  constructor(private readonly service: CardsService) {}

  @ApiOperation({ summary: '카드 정의 목록 (필터: cardId, tenantId, category)' })
  @ApiResponse({ status: 200, description: '카드 정의 배열' })
  @Get()
  list(
    @Query('cardId') cardId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('category') category?: string,
  ) {
    const normalizedCategory: CardCategory | undefined =
      category === 'hitl' ? category : undefined
    return this.service.list({
      cardId,
      tenantId: tenantId === undefined ? undefined : tenantId || null,
      category: normalizedCategory,
    })
  }

  @ApiOperation({ summary: '카드 정의 최신 버전 조회' })
  @ApiResponse({ status: 200, description: '카드 정의' })
  @Get(':cardId')
  getLatest(@Param('cardId') cardId: string) {
    return this.service.getLatest(cardId)
  }

  @ApiOperation({ summary: '카드 정의 특정 버전 조회 (immutable)' })
  @ApiResponse({ status: 200, description: '카드 정의' })
  @Get(':cardId/versions/:version')
  getVersion(
    @Param('cardId') cardId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.service.getVersion(cardId, version)
  }

  @ApiOperation({ summary: '카드 사용처 — 응답 매핑/HITL 도구 권한 참조 목록' })
  @ApiResponse({ status: 200, description: '사용처 배열' })
  @Get(':cardId/usages')
  findUsages(@Param('cardId') cardId: string) {
    return this.service.findUsages(cardId)
  }

  @ApiOperation({
    summary: '카드 정의 신규 등록 (Phase 5 카드 빌더 대비 — 1차에선 운영자 직접 입력)',
  })
  @ApiResponse({ status: 201, description: '생성된 카드 정의' })
  @Post()
  create(@Body() dto: CardDefinitionDto) {
    return this.service.create(dto)
  }
}
