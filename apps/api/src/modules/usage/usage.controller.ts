import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { normalizeRunSource } from '../../common/run-source';

@ApiTags('Usage')
@ApiBearerAuth()
@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('global')
  @Roles('admin')
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getGlobalUsage(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('source') source?: string,
  ) {
    return this.usageService.getGlobalUsage(from, to, normalizeRunSource(source));
  }

  @Get('projects/:projectId')
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getProjectUsage(
    @Param('projectId') projectId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('source') source?: string,
  ) {
    return this.usageService.getProjectUsage(projectId, from, to, normalizeRunSource(source));
  }

  @Get('logs')
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'workflowId', required: false, type: String })
  @ApiQuery({ name: 'endpointId', required: false, type: String })
  @ApiQuery({ name: 'apiKeyId', required: false, type: String })
  @ApiQuery({ name: 'source', required: false, enum: ['all', 'studio', 'client'] })
  getExecutionLogs(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('workflowId') workflowId?: string,
    @Query('endpointId') endpointId?: string,
    @Query('apiKeyId') apiKeyId?: string,
    @Query('source') source?: string,
  ) {
    return this.usageService.getExecutionLogs(
      { workflowId, endpointId, apiKeyId, source: normalizeRunSource(source) },
      from,
      to,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }
}
