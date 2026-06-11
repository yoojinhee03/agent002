import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'

type GroupKey = string

@Injectable()
export class DailyMetricsService {
  private readonly logger = new Logger(DailyMetricsService.name)

  constructor(private readonly prisma: PrismaService) {}

  // 매일 00:05 UTC — 자정 직후 부하를 피해 5분 뒤 어제 데이터 집계
  @Cron('0 5 0 * * *', { name: 'aggregateDailyMetrics' })
  async aggregateYesterday(): Promise<void> {
    const yesterday = this.shiftDays(this.startOfDayUtc(new Date()), -1)
    await this.aggregateForDate(yesterday)
  }

  async aggregateForDate(date: Date): Promise<{ date: string; aggregated: number }> {
    const start = this.startOfDayUtc(date)
    const end = this.shiftDays(start, 1)
    const dateStr = start.toISOString().slice(0, 10)

    this.logger.log(`Aggregating daily_metrics for ${dateStr} [${start.toISOString()}, ${end.toISOString()})`)

    await this.prisma.dailyMetric.deleteMany({ where: { date: start } })

    const groups = await this.prisma.workflowRun.groupBy({
      by: ['projectId', 'workflowId', 'endpointId'],
      where: { startedAt: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: { totalTokens: true, totalCost: true, latencyMs: true },
    })

    if (groups.length === 0) {
      this.logger.log(`No runs to aggregate for ${dateStr}`)
      return { date: dateStr, aggregated: 0 }
    }

    const errorGroups = await this.prisma.workflowRun.groupBy({
      by: ['projectId', 'workflowId', 'endpointId'],
      where: { startedAt: { gte: start, lt: end }, status: 'failed' },
      _count: { _all: true },
    })
    const errorMap = new Map<GroupKey, number>(
      errorGroups.map((g) => [
        this.groupKey(g.projectId, g.workflowId, g.endpointId),
        g._count._all,
      ]),
    )

    let created = 0
    for (const g of groups) {
      const calls = g._count._all
      const errors = errorMap.get(this.groupKey(g.projectId, g.workflowId, g.endpointId)) ?? 0
      const totalLatency = g._sum.latencyMs ?? 0
      const avgLatency = calls > 0 ? totalLatency / calls : 0

      await this.prisma.dailyMetric.create({
        data: {
          date: start,
          projectId: g.projectId,
          workflowId: g.workflowId,
          endpointId: g.endpointId,
          calls,
          tokens: g._sum.totalTokens ?? 0,
          cost: Number(g._sum.totalCost ?? 0),
          avgLatency,
          errors,
        },
      })
      created++
    }

    this.logger.log(`Aggregated ${created} daily_metrics rows for ${dateStr}`)
    return { date: dateStr, aggregated: created }
  }

  private startOfDayUtc(d: Date): Date {
    const out = new Date(d)
    out.setUTCHours(0, 0, 0, 0)
    return out
  }

  private shiftDays(d: Date, delta: number): Date {
    const out = new Date(d)
    out.setUTCDate(out.getUTCDate() + delta)
    return out
  }

  private groupKey(projectId: string | null, workflowId: string | null, endpointId: string | null): GroupKey {
    return `${projectId ?? ''}|${workflowId ?? ''}|${endpointId ?? ''}`
  }
}
