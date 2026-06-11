import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EnvironmentsService } from './environments.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { ReorderEnvironmentsDto } from './dto/reorder-environments.dto';

@ApiTags('Environments')
@ApiBearerAuth()
@Controller()
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get('projects/:projectId/environments')
  findByProject(@Param('projectId') projectId: string) {
    return this.environmentsService.findByProject(projectId);
  }

  @Post('projects/:projectId/environments')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEnvironmentDto,
  ) {
    return this.environmentsService.create(projectId, dto);
  }

  @Patch('projects/:projectId/environments/reorder')
  @ApiOperation({ summary: 'Update environment display order' })
  reorder(
    @Param('projectId') projectId: string,
    @Body() dto: ReorderEnvironmentsDto,
  ) {
    return this.environmentsService.reorder(projectId, dto.environmentIds);
  }

  @Patch('environments/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
  ) {
    return this.environmentsService.update(id, dto);
  }

  @Delete('environments/:id')
  delete(@Param('id') id: string) {
    return this.environmentsService.delete(id);
  }
}
