import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { buildRunSourceWhere, type RunSource } from '../../common/run-source'

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetricSummary(source: RunSource = 'all') {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const sourceWhere = await buildRunSourceWhere(this.prisma, source)

    const where = {
      startedAt: { gte: thirtyDaysAgo },
      ...sourceWhere,
    }

    const runs = await this.prisma.workflowRun.aggregate({
      where,
      _count: true,
      _sum: { totalTokens: true, totalCost: true },
      _avg: { latencyMs: true },
    })

    const errorCount = await this.prisma.workflowRun.count({
      where: { ...where, status: 'failed' },
    })

    const totalCalls = runs._count ?? 0
    const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0

    return {
      totalCalls,
      totalTokens: runs._sum?.totalTokens ?? 0,
      totalCost: Number(runs._sum?.totalCost ?? 0),
      avgLatency: Math.round(runs._avg?.latencyMs ?? 0),
      errorRate: Math.round(errorRate * 100) / 100,
      period: 'Last 30 days',
    }
  }

  async getDailyMetrics(source: RunSource = 'all') {
    if (source === 'all') {
      const rows = await this.prisma.dailyMetric.findMany({
        orderBy: { date: 'asc' },
        take: 30,
      })
      return rows.map((m) => ({
        date: m.date.toISOString().split('T')[0],
        calls: m.calls,
        tokens: m.tokens,
        cost: Number(m.cost),
        avgLatency: Number(m.avgLatency),
        errors: m.errors,
      }))
    }

    const sourceWhere = await buildRunSourceWhere(this.prisma, source)
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - 29)

    const runs = await this.prisma.workflowRun.findMany({
      where: {
        startedAt: { gte: start },
        ...sourceWhere,
      },
      select: {
        startedAt: true,
        status: true,
        totalTokens: true,
        totalCost: true,
        latencyMs: true,
      },
    })

    const buckets = new Map<
      string,
      { calls: number; tokens: number; cost: number; latencySum: number; errors: number }
    >()
    for (let i = 0; i < 30; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      buckets.set(d.toISOString().split('T')[0], {
        calls: 0,
        tokens: 0,
        cost: 0,
        latencySum: 0,
        errors: 0,
      })
    }

    for (const r of runs) {
      const day = new Date(r.startedAt)
      day.setUTCHours(0, 0, 0, 0)
      const key = day.toISOString().split('T')[0]
      const b = buckets.get(key)
      if (!b) continue
      b.calls += 1
      b.tokens += r.totalTokens ?? 0
      b.cost += Number(r.totalCost ?? 0)
      b.latencySum += r.latencyMs ?? 0
      if (r.status === 'failed') b.errors += 1
    }

    return Array.from(buckets.entries()).map(([date, b]) => ({
      date,
      calls: b.calls,
      tokens: b.tokens,
      cost: b.cost,
      avgLatency: b.calls > 0 ? b.latencySum / b.calls : 0,
      errors: b.errors,
    }))
  }

  async getRecentLogs(limit = 50, source: RunSource = 'all') {
    const sourceWhere = await buildRunSourceWhere(this.prisma, source)
    const runs = await this.prisma.workflowRun.findMany({
      where: sourceWhere,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { workflow: true, endpoint: true, apiKey: true, agent: true },
    })

    return runs.map((run) => {
      const input = (run.input ?? {}) as Record<string, unknown>
      const output = (run.output ?? {}) as Record<string, unknown>
      const promptName =
        run.workflow?.name || run.agent?.name || 'Deepagent Chat'
      return {
        id: run.id,
        promptId: run.workflowId || run.agentId || '',
        promptName,
        model: '',
        userQuery: typeof input.text === 'string' ? input.text : (typeof input.query === 'string' ? input.query : ''),
        response: typeof output.text === 'string' ? output.text : (typeof output.response === 'string' ? output.response : ''),
        inputTokens: 0,
        outputTokens: 0,
        latency: run.latencyMs ?? 0,
        tokens: run.totalTokens ?? 0,
        cost: Number(run.totalCost ?? 0),
        status: run.status === 'completed' ? 'success' : 'error',
        errorMessage: run.errorMessage ?? undefined,
        createdAt: run.startedAt.toISOString(),
        endpointId: run.endpointId ?? undefined,
        endpointPath: run.endpoint?.path ?? undefined,
        environment: run.environment ?? undefined,
        apiKeyId: run.apiKeyId ?? undefined,
        apiKeyName: run.apiKey?.name ?? undefined,
      }
    })
  }
}
