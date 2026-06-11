import { Controller, Get, Param, Query } from '@nestjs/common'
import { RunsService } from './runs.service'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('runs')
@Controller()
export class RunsController {
  constructor(private readonly service: RunsService) {}

  @Get('workflows/:workflowId/runs')
  listByWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listByWorkflow(workflowId, Number(page ?? 1), Number(pageSize ?? 20))
  }

  @Get('runs/:runId')
  getById(@Param('runId') runId: string) {
    return this.service.getById(runId)
  }

  @Get('runs/:runId/traces')
  getTraces(@Param('runId') runId: string) {
    return this.service.getTraces(runId)
  }
}
