import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { ConfigureProviderDto } from './dto/configure-provider.dto';
import { CreateModelDto } from './dto/create-model.dto';
import { CreateLocalProviderDto } from './dto/create-local-provider.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.providersService.findAll(userId);
  }

  @Get('models/enabled')
  getEnabledModels(@CurrentUser('id') userId: string) {
    return this.providersService.getEnabledModels(userId);
  }

  @Post(':id/configure')
  configure(
    @Param('id') id: string,
    @Body() dto: ConfigureProviderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.providersService.configure(id, dto.apiKey, userId);
  }

  @Delete(':id/api-key')
  removeApiKey(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.providersService.removeApiKey(id, userId);
  }

  @Post(':id/test')
  testConnection(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.providersService.testConnection(id, userId);
  }

  @Patch(':providerId/models/:modelId/toggle')
  @Roles('admin')
  toggleModel(
    @Param('providerId') providerId: string,
    @Param('modelId') modelId: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.providersService.toggleModel(providerId, modelId, enabled);
  }

  @Post(':providerId/models')
  @Roles('admin')
  addCustomModel(
    @Param('providerId') providerId: string,
    @Body() dto: CreateModelDto,
  ) {
    return this.providersService.addCustomModel(providerId, dto);
  }

  @Delete(':providerId/models/:modelId')
  @Roles('admin')
  deleteCustomModel(
    @Param('providerId') providerId: string,
    @Param('modelId') modelId: string,
  ) {
    return this.providersService.deleteCustomModel(providerId, modelId);
  }

  @Post('local')
  @Roles('admin')
  addLocalProvider(@Body() dto: CreateLocalProviderDto) {
    return this.providersService.addLocalProvider(dto.name, dto.endpoint);
  }

  @Delete(':id/local')
  @Roles('admin')
  deleteLocalProvider(@Param('id') id: string) {
    return this.providersService.deleteLocalProvider(id);
  }

  @Patch(':id/endpoint')
  @Roles('admin')
  configureEndpoint(@Param('id') id: string, @Body('endpoint') endpoint: string) {
    return this.providersService.configureEndpoint(id, endpoint);
  }

  @Post(':id/discover-models')
  @Roles('admin')
  discoverModels(@Param('id') id: string) {
    return this.providersService.discoverModels(id);
  }
}
