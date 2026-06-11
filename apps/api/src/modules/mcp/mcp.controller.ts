import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger'
import { McpService } from './mcp.service'
import { CreateMcpServerDto } from './dto/create-mcp-server.dto'
import { UpdateMcpServerDto, ToggleToolVisibilityDto } from './dto/update-mcp-server.dto'

@ApiTags('mcp')
@Controller()
export class McpController {
  constructor(private readonly service: McpService) {}

  @Get('projects/:projectId/mcp')
  @ApiOperation({ summary: 'MCP Server 목록 조회' })
  @ApiParam({ name: 'projectId', description: 'Project UUID 또는 slug' })
  @ApiResponse({ status: 200, description: 'McpServer[]' })
  list(@Param('projectId') projectId: string) {
    return this.service.list(projectId)
  }

  @Get('mcp/:id')
  @ApiOperation({ summary: 'MCP Server 상세' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: 'McpServer' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post('projects/:projectId/mcp')
  @ApiOperation({ summary: 'MCP Server 등록' })
  @ApiParam({ name: 'projectId', description: 'Project UUID 또는 slug' })
  @ApiResponse({ status: 201, description: '생성된 McpServer' })
  create(@Param('projectId') projectId: string, @Body() dto: CreateMcpServerDto) {
    return this.service.create(projectId, dto)
  }

  @Put('mcp/:id')
  @ApiOperation({ summary: 'MCP Server 설정 수정 (credentialMode, requiredUserFields, exposedTools 포함)' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: '수정된 McpServer' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(@Param('id') id: string, @Body() dto: UpdateMcpServerDto) {
    return this.service.update(id, dto)
  }

  @Delete('mcp/:id')
  @ApiOperation({ summary: 'MCP Server 삭제' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  delete(@Param('id') id: string) {
    return this.service.delete(id)
  }

  @Post('mcp/:id/connect')
  @ApiOperation({ summary: '연결 테스트 + tool 목록 갱신' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: '갱신된 McpServer (status=connected 또는 error)' })
  connect(@Param('id') id: string) {
    return this.service.connect(id)
  }

  @Post('mcp/:id/refresh-tools')
  @ApiOperation({ summary: 'MCP 서버 도구 목록만 강제 새로고침 (이미 connected 상태에서 호출)' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: '갱신된 McpServer' })
  refreshTools(@Param('id') id: string) {
    return this.service.refreshTools(id)
  }

  @Post('mcp/:id/disconnect')
  @ApiOperation({ summary: '연결 해제' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: '갱신된 McpServer (status=disconnected)' })
  disconnect(@Param('id') id: string) {
    return this.service.disconnect(id)
  }

  @Get('mcp/:id/tools')
  @ApiOperation({ summary: '캐시된 tool 목록 (관리자용 — exposedTools 필터 없이 전체 반환)' })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiResponse({ status: 200, description: 'McpTool[]' })
  async getTools(@Param('id') id: string) {
    const server = await this.service.getById(id)
    return server.tools ?? []
  }

  @Patch('mcp/:id/tools/:toolName/visibility')
  @ApiOperation({
    summary: '단일 도구 노출 토글',
    description:
      'exposed=false 이고 exposedTools 가 비어있던 경우(전체 노출) → 해당 도구만 제외한 나머지를 채운다.',
  })
  @ApiParam({ name: 'id', description: 'McpServer UUID' })
  @ApiParam({ name: 'toolName', description: '도구 이름' })
  @ApiBody({ type: ToggleToolVisibilityDto })
  @ApiResponse({ status: 200, description: '갱신된 McpServer' })
  @ApiResponse({ status: 404, description: 'Not found' })
  toggleToolVisibility(
    @Param('id') id: string,
    @Param('toolName') toolName: string,
    @Body() dto: ToggleToolVisibilityDto,
  ) {
    return this.service.toggleToolVisibility(id, toolName, dto.exposed)
  }

  @Get('projects/:projectId/mcp/tools')
  @ApiOperation({
    summary: '프로젝트 전체 MCP tool 집계 (Agent Builder용)',
    description: 'onlyExposed=true 시 exposedTools 가 있는 서버는 해당 도구만 반환.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID 또는 slug' })
  @ApiQuery({
    name: 'onlyExposed',
    required: false,
    type: Boolean,
    description: 'true 이면 exposedTools 필터 적용',
  })
  @ApiResponse({ status: 200, description: '{ serverId, serverName, tools, exposedTools }[]' })
  listAllTools(
    @Param('projectId') projectId: string,
    @Query('onlyExposed') onlyExposed?: string,
  ) {
    return this.service.listAllTools(projectId, onlyExposed === 'true')
  }
}
