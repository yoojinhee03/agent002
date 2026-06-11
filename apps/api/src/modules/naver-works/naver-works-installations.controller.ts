import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { NaverWorksInstallationsService } from './naver-works-installations.service'
import { UpsertNaverWorksInstallationDto } from './dto/upsert-installation.dto'
import { UpdateAgentDto } from './dto/update-agent.dto'
import { EnableInstallationDto } from './dto/enable.dto'

@ApiTags('NaverWorks')
@ApiBearerAuth()
@Roles('admin')
@Controller('naver-works/installations')
export class NaverWorksInstallationsController {
  constructor(private readonly installationsService: NaverWorksInstallationsService) {}

  @Get()
  @ApiOperation({ summary: 'Project 의 NAVER WORKS 봇 설치 목록' })
  @ApiResponse({ status: 200, description: 'InstallationView 배열 (시크릿 미포함)' })
  list(@Query('projectId') projectId: string) {
    return this.installationsService.list(projectId)
  }

  @Get(':id')
  @ApiOperation({ summary: '단일 봇 설치 조회' })
  @ApiResponse({ status: 200, description: 'InstallationView' })
  get(@Param('id') id: string) {
    return this.installationsService.get(id)
  }

  @Post()
  @ApiOperation({ summary: 'NAVER WORKS 봇 등록/갱신 (botId 단위 upsert)' })
  @ApiResponse({ status: 201, description: '등록/갱신된 InstallationView' })
  @ApiResponse({ status: 422, description: '자격증명 검증 실패 — JWT 토큰 발급 오류' })
  @ApiResponse({ status: 409, description: '다른 프로젝트에 이미 등록된 botId' })
  upsert(
    @Query('projectId') projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertNaverWorksInstallationDto,
  ) {
    return this.installationsService.upsert(projectId, userId, dto)
  }

  @Patch(':id/agent')
  @ApiOperation({ summary: '봇에 매핑된 에이전트 변경' })
  @ApiResponse({ status: 200, description: '갱신된 InstallationView' })
  updateAgent(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.installationsService.updateAgent(id, dto.agentId)
  }

  @Patch(':id/enable')
  @ApiOperation({ summary: '봇 활성화/비활성화 토글' })
  @ApiResponse({ status: 200, description: '갱신된 InstallationView' })
  enable(@Param('id') id: string, @Body() dto: EnableInstallationDto) {
    return this.installationsService.enable(id, dto.enabled)
  }

  @Delete(':id')
  @ApiOperation({ summary: '봇 설치 제거' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  async delete(@Param('id') id: string) {
    await this.installationsService.delete(id)
    return { deleted: true }
  }
}
