import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ToolsService } from './tools.service'
import { CreateToolDto } from './dto/create-tool.dto'
import { TestToolDto } from './dto/test-tool.dto'
import { AiGenerateDto } from './dto/ai-generate.dto'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { InternalVisionAnalyzeDto } from './dto/internal-vision-analyze.dto'

@ApiTags('tools')
@Controller()
export class ToolsController {
  constructor(
    private readonly service: ToolsService,
    private readonly jwtService: JwtService,
  ) {}

  private assertInternalAuthorized(apiKey: string | undefined, authorization: string | undefined) {
    const expected = process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
    if (apiKey && apiKey === expected) return

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim()
      if (!token) throw new UnauthorizedException('Unauthorized')
      try {
        const secret = process.env.JWT_SECRET || 'dev-secret'
        this.jwtService.verify(token, { secret })
        return
      } catch {
        throw new UnauthorizedException('Unauthorized')
      }
    }

    throw new UnauthorizedException('Unauthorized')
  }

  // ============================================================
  // AI Assistance
  // ============================================================

  @ApiOperation({ summary: 'AI를 이용한 도구 구성 요소 생성/수정' })
  @Post('tools/ai-generate')
  aiGenerate(@Body() dto: AiGenerateDto) {
    return this.service.aiGenerate(dto)
  }

  // ============================================================
  // Tool Groups
  // ============================================================

  @ApiOperation({ summary: '프로젝트 Tool 그룹 목록' })
  @Get('projects/:projectId/tool-groups')
  listGroups(@Param('projectId') projectId: string) {
    return this.service.listGroups(projectId)
  }

  @ApiOperation({ summary: 'Tool 그룹 생성' })
  @Post('projects/:projectId/tool-groups')
  createGroup(
    @Param('projectId') projectId: string,
    @Body() dto: { name: string; description?: string; type: 'rest' | 'code' },
  ) {
    return this.service.createGroup(projectId, dto)
  }

  @ApiOperation({ summary: 'Tool 그룹 수정' })
  @Patch('tool-groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; enabled?: boolean },
  ) {
    return this.service.updateGroup(id, dto)
  }

  @ApiOperation({ summary: 'Tool 그룹 삭제 (도구 cascade)' })
  @Delete('tool-groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id)
  }

  @ApiOperation({ summary: '그룹 내 도구 목록' })
  @Get('tool-groups/:groupId/tools')
  listGroupTools(@Param('groupId') groupId: string) {
    return this.service.listGroupTools(groupId)
  }

  @ApiOperation({ summary: '그룹에 도구 추가' })
  @Post('tool-groups/:groupId/tools')
  addToolToGroup(@Param('groupId') groupId: string, @Body() dto: CreateToolDto) {
    return this.service.addToolToGroup(groupId, dto)
  }

  // ============================================================
  // Integration (원클릭 연동 서비스 등록 / 동기화)
  // ============================================================

  @ApiOperation({ summary: '내부 서비스 원클릭 연동 (OpenAPI spec URL → Tool Group + Tools 자동 생성)' })
  @Post('projects/:projectId/integrations')
  registerIntegration(
    @Param('projectId') projectId: string,
    @Body() body: {
      name: string
      specUrl: string
      baseUrlOverride?: string
      auth?: { type: 'none' | 'bearer' | 'api_key'; value?: string; headerName?: string }
    },
  ) {
    return this.service.registerIntegration(projectId, body)
  }

  @ApiOperation({ summary: '연동된 Tool Group의 spec URL 기준으로 도구 목록 재동기화' })
  @Post('tool-groups/:id/sync')
  syncIntegration(@Param('id') id: string) {
    return this.service.syncIntegration(id)
  }

  // ============================================================
  // OpenAPI Import / Export
  // ============================================================

  @ApiOperation({ summary: 'OpenAPI URL 분석 (미리보기)' })
  @Post('tool-groups/:id/analyze-openapi-url')
  analyzeOpenApiByUrl(
    @Body() body: { url: string; baseUrlOverride?: string },
  ) {
    return this.service.analyzeOpenApiByUrl(body.url, body.baseUrlOverride)
  }

  @ApiOperation({ summary: 'OpenAPI 스펙 분석 (미리보기)' })
  @Post('tool-groups/:id/analyze-openapi')
  analyzeOpenApi(
    @Body() body: { spec: string; format: 'json' | 'yaml'; baseUrlOverride?: string },
  ) {
    return this.service.analyzeOpenApi(body.spec, body.format ?? 'json', body.baseUrlOverride)
  }

  @ApiOperation({ summary: '선택한 도구들 일괄 등록' })
  @Post('projects/:projectId/tool-groups/:groupId/batch-import')
  batchImport(
    @Param('projectId') projectId: string,
    @Param('groupId') groupId: string,
    @Body() body: { tools: any[]; mode: 'update' | 'reset' },
  ) {
    return this.service.batchImportTools(projectId, groupId, body.tools, body.mode)
  }

  @ApiOperation({ summary: '그룹을 OpenAPI 스펙으로 내보내기' })
  @Get('tool-groups/:id/export-openapi')
  exportOpenApi(
    @Param('id') id: string,
    @Query('format') format: 'json' | 'yaml' = 'json',
  ) {
    return this.service.exportOpenApi(id, format)
  }

  // ============================================================
  // Tool CRUD (legacy)
  // ============================================================

  @Get('projects/:projectId/tools')
  list(@Param('projectId') projectId: string) {
    return this.service.list(projectId)
  }

  @ApiOperation({ summary: 'Built-in 도구 카탈로그 + 활성화 상태 조회' })
  @Get('projects/:projectId/tools/builtin')
  getBuiltin(@Param('projectId') projectId: string) {
    return this.service.getBuiltin(projectId)
  }

  @ApiOperation({ summary: 'Built-in 도구 활성화 토글' })
  @Patch('projects/:projectId/tools/builtin/:toolId')
  toggleBuiltin(
    @Param('projectId') projectId: string,
    @Param('toolId') toolId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.service.toggleBuiltin(projectId, toolId, body.enabled)
  }

  // ============================================================
  // Gmail OAuth (Built-in)
  // ============================================================

  @ApiOperation({ summary: 'Gmail OAuth 인증 URL 생성 (Built-in gmail_search)' })
  @Get('projects/:projectId/tools/builtin/gmail/auth-url')
  getGmailAuthUrl(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.getGmailAuthUrl(projectId, user.id)
  }

  @ApiOperation({ summary: 'Gmail OAuth 앱 설정 저장 (clientId/clientSecret/redirectUri)' })
  @Patch('projects/:projectId/tools/builtin/gmail/app-config')
  saveGmailAppConfig(
    @Param('projectId') projectId: string,
    @Body() body: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] },
  ) {
    return this.service.saveGmailOAuthAppConfig(projectId, body)
  }

  @ApiOperation({ summary: 'Gmail OAuth 앱 설정 조회 (Secret은 노출하지 않음)' })
  @Get('projects/:projectId/tools/builtin/gmail/app-config')
  getGmailAppConfig(@Param('projectId') projectId: string) {
    return this.service.getGmailOAuthAppConfig(projectId)
  }

  @ApiOperation({ summary: 'Gmail OAuth 앱 설정/연동 정보 삭제 (초기화)' })
  @Delete('projects/:projectId/tools/builtin/gmail/app-config')
  clearGmailAppConfig(@Param('projectId') projectId: string) {
    return this.service.clearGmailOAuthAppConfig(projectId)
  }

  @ApiOperation({ summary: 'Gmail OAuth 콜백 처리 (code 교환 후 refresh_token 저장)' })
  @Post('projects/:projectId/tools/builtin/gmail/callback')
  gmailCallback(
    @Body() body: { code: string; state: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.service.exchangeGmailCode(body.code, body.state, user.id)
  }

  @Public()
  @ApiOperation({
    summary: 'Runner 내부용 Gmail access token 발급',
    description:
      'source 별 자격증명 소스: studio → 프로젝트(admin) OAuth 만 사용, client → 사용자 OAuth 만 사용. ' +
      'source 미지정 시 기존 동작 (userId 있으면 user 우선, 없으면 프로젝트).',
  })
  @Get('internal/agents/:agentId/gmail/access-token')
  issueGmailAccessToken(
    @Param('agentId') agentId: string,
    @Query('userId') userId: string | undefined,
    @Query('source') source: string | undefined,
    @Headers('x-api-key') apiKey: string | undefined,
  ) {
    const expected = process.env.RUNNER_INTERNAL_KEY || 'internal-service-key'
    if (!apiKey || apiKey !== expected) {
      throw new UnauthorizedException('Unauthorized')
    }
    const normalizedSource: 'studio' | 'client' | undefined =
      source === 'studio' || source === 'client' ? source : undefined
    return this.service.issueGmailAccessTokenByAgentId(agentId, userId, normalizedSource)
  }

  @Public()
  @ApiOperation({ summary: 'Runner 내부용: Vision 기반 문서 이미지 분석' })
  @ApiResponse({ status: 200, description: 'Vision analyze result', schema: { example: { content: '{"ok":true}' } } })
  @Post('internal/vision/analyze')
  internalVisionAnalyze(
    @Body() dto: InternalVisionAnalyzeDto,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertInternalAuthorized(apiKey, authorization)
    return this.service.internalVisionAnalyze(dto)
  }

  @Public()
  @ApiOperation({ summary: 'Runner/Web 공용: PDF Parse 규칙 조회' })
  @Get('internal/agents/:agentId/pdf-parse-rules')
  getPdfParseRules(
    @Param('agentId') agentId: string,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertInternalAuthorized(apiKey, authorization)
    return this.service.getPdfParseRulesByAgentId(agentId)
  }

  @Public()
  @ApiOperation({ summary: 'Runner/Web 공용: PDF Parse 규칙 저장(전체 교체)' })
  @Put('internal/agents/:agentId/pdf-parse-rules')
  putPdfParseRules(
    @Param('agentId') agentId: string,
    @Body() body: unknown,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertInternalAuthorized(apiKey, authorization)
    return this.service.savePdfParseRulesByAgentId(agentId, body)
  }

  @Public()
  @ApiOperation({ summary: 'Runner/Web 공용: PDF Parse 규칙 저장(전체 교체)' })
  @Post('internal/agents/:agentId/pdf-parse-rules')
  postPdfParseRules(
    @Param('agentId') agentId: string,
    @Body() body: unknown,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertInternalAuthorized(apiKey, authorization)
    return this.service.savePdfParseRulesByAgentId(agentId, body)
  }

  @Public()
  @ApiOperation({ summary: 'Runner/Web 공용: PDF Parse 규칙 삭제' })
  @Delete('internal/agents/:agentId/pdf-parse-rules')
  deletePdfParseRules(
    @Param('agentId') agentId: string,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertInternalAuthorized(apiKey, authorization)
    return this.service.clearPdfParseRulesByAgentId(agentId)
  }

  @Get('tools/:id')
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post('projects/:projectId/tools')
  create(@Param('projectId') projectId: string, @Body() dto: CreateToolDto) {
    return this.service.create(projectId, dto)
  }

  @Patch('tools/:id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateToolDto>) {
    return this.service.update(id, dto)
  }

  @Patch('tools/:id/toggle')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id)
  }

  @Delete('tools/:id')
  delete(@Param('id') id: string) {
    return this.service.delete(id)
  }

  @ApiOperation({ summary: '저장된 Tool 즉시 실행 테스트' })
  @Post('tools/:id/test')
  testById(@Param('id') id: string, @Body() dto: TestToolDto) {
    return this.service.testById(id, dto.input ?? {})
  }

  @ApiOperation({ summary: '저장 없이 Tool 인라인 테스트 (위자드 Step 5)' })
  @Post('projects/:projectId/tools/test')
  testInline(@Body() dto: TestToolDto) {
    return this.service.testInline(dto.type ?? 'http', dto.config ?? {}, dto.input ?? {})
  }
}
