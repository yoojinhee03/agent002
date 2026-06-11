import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DailyMetricsService } from './daily-metrics.service'
import { Roles } from '../auth/decorators/roles.decorator'

@ApiTags('DailyMetrics')
@ApiBearerAuth()
@Controller('daily-metrics')
export class DailyMetricsController {
  constructor(private readonly service: DailyMetricsService) {}

  @ApiOperation({ summary: '특정 날짜의 daily_metrics 수동 재집계 (cron 백필/재실행용)' })
  @ApiResponse({ status: 200, description: '집계된 행 수 반환' })
  @Post('aggregate')
  @Roles('admin')
  manualAggregate(@Body() body: { date?: string }) {
    const target = body?.date ? new Date(body.date) : new Date(Date.now() - 86400000)
    return this.service.aggregateForDate(target)
  }
}
