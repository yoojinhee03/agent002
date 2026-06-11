import { Module } from '@nestjs/common'
import { DeploymentsService } from './deployments.service'
import { DeploymentsController } from './deployments.controller'
import { PrismaService } from '../../prisma/prisma.service'

@Module({
  providers: [DeploymentsService, PrismaService],
  controllers: [DeploymentsController],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
