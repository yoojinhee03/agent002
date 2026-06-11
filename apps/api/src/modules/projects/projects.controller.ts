import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
import { ProjectsService } from './projects.service'
import { ActivityLogService } from './activity-log.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { DuplicateProjectDto } from './dto/duplicate-project.dto'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiQuery({
    name: 'membersOnly',
    required: false,
    description: 'Filter to projects where current user is a member',
  })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  findAll(
    @CurrentUser() user: { id: string; email: string } | null,
    @Query('membersOnly') membersOnly?: string,
  ) {
    return this.projectsService.findAll(
      user?.email,
      membersOnly === 'true',
    )
  }

  @Get('check-slug')
  @ApiOperation({ summary: 'Check slug availability' })
  @ApiQuery({ name: 'slug', description: 'Slug to check' })
  @ApiQuery({ name: 'excludeId', required: false, description: 'Project ID to exclude' })
  @ApiResponse({ status: 200, description: 'Slug availability checked' })
  checkSlug(
    @Query('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.projectsService.checkSlug(slug, excludeId)
  }

  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get project by slug (public)' })
  @ApiParam({ name: 'slug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.projectsService.findBySlug(slug)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findById(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.projectsService.findById(id, user.email)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  create(
    @Body() data: CreateProjectDto,
    @CurrentUser() user: { id: string; email: string; name: string },
  ) {
    return this.projectsService.create(data, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @Param('id') id: string,
    @Body() data: UpdateProjectDto,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.projectsService.update(id, data, user.email)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.projectsService.delete(id, user.email)
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a project' })
  @ApiParam({ name: 'id', description: 'Project ID to duplicate' })
  @ApiResponse({ status: 201, description: 'Project duplicated successfully' })
  @ApiResponse({ status: 404, description: 'Source project not found' })
  duplicate(
    @Param('id') id: string,
    @Body() data: DuplicateProjectDto,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.projectsService.duplicate(id, data, user.email)
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: 'Toggle project favorite' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Favorite toggled' })
  toggleFavorite(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.projectsService.toggleFavorite(id, user.email)
  }

  @Get(':projectId/activity-logs')
  @ApiOperation({ summary: 'Get project activity logs' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Activity logs retrieved successfully' })
  getActivityLogs(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.activityLogService.findByProject(projectId, user.email)
  }
}
