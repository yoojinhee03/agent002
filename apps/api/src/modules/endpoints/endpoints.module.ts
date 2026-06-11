import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EndpointsService } from './endpoints.service'
import { EndpointsController } from './endpoints.controller'
import { PrismaService } from '../../prisma/prisma.service'

@Module({
  imports: [ConfigModule],
  providers: [EndpointsService, PrismaService],
  controllers: [EndpointsController],
  exports: [EndpointsService],
})
export class EndpointsModule {}
