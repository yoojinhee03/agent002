import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { normalizeRunSource } from '../../common/run-source';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('summary')
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getSummary(@Query('source') source?: string) {
    return this.monitoringService.getMetricSummary(normalizeRunSource(source));
  }

  @Get('daily')
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getDailyMetrics(@Query('source') source?: string) {
    return this.monitoringService.getDailyMetrics(normalizeRunSource(source));
  }

  @Get('logs')
  @ApiQuery({ name: 'workflowId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getLogs(
    @Query('workflowId') _workflowId?: string,
    @Query('status') _status?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    return this.monitoringService.getRecentLogs(
      limit ? parseInt(limit, 10) : undefined,
      normalizeRunSource(source),
    );
  }
}
