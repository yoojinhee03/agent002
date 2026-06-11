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
import { IsBoolean } from 'class-validator'
import { Transform } from 'class-transformer'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { SlackInstallationsService } from './slack-installations.service'
import { SlackRuntimeService } from './slack-runtime.service'
import { UpsertInstallationDto } from './dto/upsert-installation.dto'

class EnableDto {
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  enabled!: boolean
}

@ApiTags('Slack')
@ApiBearerAuth()
@Roles('admin')
@Controller('slack/installations')
export class SlackInstallationsController {
  constructor(
    private readonly installationsService: SlackInstallationsService,
    private readonly runtimeService: SlackRuntimeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Slack 설치 정보 조회' })
  @ApiResponse({ status: 200, description: 'SlackInstallation 뷰 (토큰 미포함)' })
  @ApiResponse({ status: 404, description: '설치 없음' })
  get(@Query('projectId') projectId: string) {
    return this.installationsService.get(projectId)
  }

  @Post()
  @ApiOperation({ summary: 'Slack 토큰 등록/갱신 (upsert)' })
  @ApiResponse({ status: 201, description: '등록/갱신된 SlackInstallation 뷰' })
  @ApiResponse({ status: 422, description: 'Slack auth.test 실패 — 토큰 검증 오류' })
  async upsert(
    @Query('projectId') projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertInstallationDto,
  ) {
    const view = await this.installationsService.upsert(projectId, userId, dto)
    // 설치 후 Bolt App 재기동
    await this.runtimeService.restart()
    return view
  }

  @Patch(':id/enable')
  @ApiOperation({ summary: 'Slack 봇 활성화/비활성화 토글' })
  @ApiResponse({ status: 200, description: '갱신된 SlackInstallation 뷰' })
  async enable(@Param('id') id: string, @Body() dto: EnableDto) {
    const view = await this.installationsService.enable(id, dto.enabled)
    if (dto.enabled) {
      await this.runtimeService.restart()
    } else {
      await this.runtimeService.stop()
    }
    return view
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Slack 설치 제거' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  async delete(@Param('id') id: string) {
    await this.installationsService.delete(id)
    await this.runtimeService.stop()
    return { deleted: true }
  }
}
