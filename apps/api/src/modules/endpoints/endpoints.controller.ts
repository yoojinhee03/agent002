import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger'
import { EndpointsService } from './endpoints.service'
import { EndpointResponseDto } from './dto/endpoint-response.dto'
import { CreateApiKeyDto } from './dto/create-api-key.dto'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('Endpoints')
@ApiBearerAuth()
@Controller()
export class EndpointsController {
  constructor(private readonly endpointsService: EndpointsService) {}

  @Get('endpoints')
  @ApiOperation({ summary: 'List all endpoints (global)' })
  @ApiResponse({ status: 200, type: EndpointResponseDto, isArray: true, description: 'All endpoints retrieved successfully' })
  findAll() {
    // EndpointsService.list now requires a projectId or 'all' logic
    return this.endpointsService.list('all')
  }

  @Get('projects/:projectId/endpoints')
  @Public()
  @ApiOperation({ summary: 'List endpoints for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, type: EndpointResponseDto, isArray: true, description: 'Endpoints retrieved successfully' })
  findByProject(@Param('projectId') projectId: string) {
    return this.endpointsService.findByProject(projectId)
  }

  @Get('projects/:projectId/api-keys')
  @ApiOperation({ summary: 'List API keys for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'API keys retrieved successfully' })
  getApiKeys(@Param('projectId') projectId: string) {
    return this.endpointsService.listApiKeys(projectId)
  }

  @Post('projects/:projectId/api-keys')
  @ApiOperation({ summary: 'Create an API key for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'API key created successfully (raw key is returned once)' })
  createApiKey(
    @Param('projectId') projectId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.endpointsService.createApiKey(projectId, dto)
  }

  @Patch('api-keys/:id/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  revokeApiKey(@Param('id') id: string) {
    return this.endpointsService.revokeApiKey(id)
  }

  @Patch('api-keys/:id/toggle')
  @ApiOperation({ summary: 'Toggle an API key enabled flag' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'API key toggled successfully' })
  async toggleApiKey(@Param('id') id: string) {
    const updated = await this.endpointsService.toggleApiKey(id)
    if (!updated) throw new NotFoundException('API key not found')
    return updated
  }
}
