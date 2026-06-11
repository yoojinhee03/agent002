import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger'
import { DeploymentsService } from './deployments.service'
import { CreateDeploymentDto } from './dto/create-deployment.dto'

@ApiTags('Deployments')
@ApiBearerAuth()
@Controller()
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Get('projects/:projectId/deployments')
  @ApiOperation({ summary: 'List deployments for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Deployments retrieved successfully' })
  findByProject(@Param('projectId') projectId: string) {
    return this.deploymentsService.findByProject(projectId)
  }

  @Post('projects/:projectId/deployments')
  @ApiOperation({ summary: 'Deploy a prompt version' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Deployment created successfully' })
  deploy(
    @Param('projectId') projectId: string,
    @Body() data: CreateDeploymentDto,
  ) {
    return this.deploymentsService.deploy(projectId, data)
  }

  @Delete('deployments/:deploymentId')
  @ApiOperation({ summary: 'Undeploy a deployment' })
  @ApiParam({ name: 'deploymentId', description: 'Deployment ID' })
  @ApiResponse({ status: 200, description: 'Deployment removed successfully' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  undeploy(@Param('deploymentId') deploymentId: string) {
    return this.deploymentsService.undeploy(deploymentId)
  }

  @Get('projects/:projectId/deployments/logs')
  @ApiOperation({ summary: 'Get deployment logs for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Deployment logs retrieved successfully' })
  getLogs(@Param('projectId') projectId: string) {
    return this.deploymentsService.getLogs(projectId)
  }
}
