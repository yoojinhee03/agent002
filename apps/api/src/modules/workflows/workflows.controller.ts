import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'
import { WorkflowsService } from './workflows.service'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { UpdateWorkflowDto } from './dto/update-workflow.dto'
import { CreateVersionDto } from './dto/create-version.dto'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('workflows')
@Controller()
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  // ============================================================
  // Workflows
  // ============================================================

  @Get('projects/:projectId/workflows')
  list(@Param('projectId') projectId: string) {
    return this.service.list(projectId)
  }

  @Get('workflows/:id')
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post('projects/:projectId/workflows')
  create(@Param('projectId') projectId: string, @Body() dto: CreateWorkflowDto) {
    return this.service.create(projectId, dto)
  }

  @Patch('workflows/:id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.service.update(id, dto)
  }

  @Delete('workflows/:id')
  delete(@Param('id') id: string) {
    return this.service.delete(id)
  }

  @Get('projects/:projectId/workflows/check-slug')
  checkSlug(
    @Param('projectId') projectId: string,
    @Query('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.service.checkSlug(projectId, slug, excludeId)
  }

  // ============================================================
  // Versions
  // ============================================================

  @Get('workflows/:workflowId/versions')
  listVersions(@Param('workflowId') workflowId: string) {
    return this.service.listVersions(workflowId)
  }

  @Get('workflow-versions/:versionId')
  getVersionById(@Param('versionId') versionId: string) {
    return this.service.getVersionById(versionId)
  }

  @Post('workflows/:workflowId/versions')
  createVersion(@Param('workflowId') workflowId: string, @Body() dto: CreateVersionDto) {
    return this.service.createVersion(workflowId, dto)
  }

  @Post('workflows/:workflowId/versions/:versionId/rollback')
  rollback(@Param('workflowId') workflowId: string, @Param('versionId') versionId: string) {
    return this.service.rollback(workflowId, versionId)
  }
}
