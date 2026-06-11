import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import { normalizeRunSource } from '../../common/run-source'

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get global dashboard overview' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Optional project filter' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['all', 'studio', 'client'],
    description: "Traffic source filter (default 'all')",
  })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  getGlobalOverview(
    @Query('projectId') projectId?: string,
    @Query('source') source?: string,
  ) {
    return this.dashboardService.getOverview(projectId, normalizeRunSource(source))
  }

  @Get('projects/:projectId/dashboard')
  @ApiOperation({ summary: 'Get project dashboard overview (legacy)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['all', 'studio', 'client'],
    description: "Traffic source filter (default 'all')",
  })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  getOverview(
    @Param('projectId') projectId: string,
    @Query('source') source?: string,
  ) {
    return this.dashboardService.getOverview(projectId, normalizeRunSource(source))
  }
}
