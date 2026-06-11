import { Module } from '@nestjs/common'
import { MeProvidersController } from './me-providers.controller'
import { MeProvidersService } from './me-providers.service'

@Module({
  controllers: [MeProvidersController],
  providers: [MeProvidersService],
  exports: [MeProvidersService],
})
export class MeProvidersModule {}
