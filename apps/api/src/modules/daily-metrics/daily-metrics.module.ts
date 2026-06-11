import { Module } from '@nestjs/common'
import { DailyMetricsController } from './daily-metrics.controller'
import { DailyMetricsService } from './daily-metrics.service'
import { PrismaService } from '../../prisma/prisma.service'

@Module({
  controllers: [DailyMetricsController],
  providers: [DailyMetricsService, PrismaService],
  exports: [DailyMetricsService],
})
export class DailyMetricsModule {}
