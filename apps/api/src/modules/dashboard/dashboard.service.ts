import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  apiKeySourceWhere,
  buildRunSourceWhere,
  type RunSource,
} from '../../common/run-source'

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(projectId?: string, source: RunSource = 'all') {
    const where = projectId ? { projectId } : {}
    const workflowWhere = projectId ? { workflow: { projectId } } : {}
    const runProjectWhere = projectId ? { projectId } : {}
    const runSourceWhere = await buildRunSourceWhere(this.prisma, source)
    const runWhere = { ...runProjectWhere, ...runSourceWhere }
    const apiKeyWhere = { ...where, ...apiKeySourceWhere(source) }

    const usePreaggregated = source === 'all'

    const [
      workflows,
      agents,
      deployments,
      environments,
      endpoints,
      apiKeys,
      members,
      metricSummary,
      dailyMetrics,
      recentRuns,
      deploymentLogs,
      activityLogs,
    ] = await Promise.all([
      this.prisma.workflow.findMany({ where }),
      this.prisma.agent.findMany({ where }),
      this.prisma.deployment.findMany({ where }),
      this.prisma.deploymentEnvironment.findMany({
        where,
        orderBy: { order: 'asc' },
      }),
      this.prisma.endpoint.findMany({ where: workflowWhere }),
      this.prisma.apiKey.findMany({ where: apiKeyWhere }),
      this.prisma.projectMember.findMany({ where }),
      this.getMetricSummary(projectId, runSourceWhere),
      this.getDailyMetrics(projectId, runSourceWhere, usePreaggregated),
      this.prisma.workflowRun.findMany({
        where: runWhere,
        orderBy: { startedAt: 'desc' },
        take: 20,
      }).then((runs) =>
        runs.map((run) => ({ ...run, startedAt: run.startedAt.toISOString(), totalCost: Number(run.totalCost || 0) }))
      ),
      this.prisma.deploymentLog.findMany({
        where,
        orderBy: { performedAt: 'desc' },
        take: 20,
      }),
      this.prisma.projectActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return {
      workflows,
      agents,
      deployments,
      environments,
      endpoints,
      apiKeys,
      members,
      metricSummary,
      dailyMetrics,
      recentRuns,
      deploymentLogs,
      activityLogs,
    }
  }

  private async getMetricSummary(
    projectId: string | undefined,
    runSourceWhere: Prisma.WorkflowRunWhereInput,
  ) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const where: Prisma.WorkflowRunWhereInput = {
      ...(projectId ? { projectId } : {}),
      startedAt: { gte: thirtyDaysAgo },
      ...runSourceWhere,
    }

    const runs = await this.prisma.workflowRun.aggregate({
      where,
      _count: true,
      _sum: {
        totalTokens: true,
        totalCost: true,
      },
    })

    const errorCount = await this.prisma.workflowRun.count({
      where: {
        ...where,
        status: 'failed',
      },
    })

    const totalCalls = runs._count ?? 0
    const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0

    return {
      totalCalls,
      totalTokens: runs._sum?.totalTokens ?? 0,
      totalCost: runs._sum?.totalCost ?? 0,
      errorRate: Math.round(errorRate * 100) / 100,
      period: 'Last 30 days',
    }
  }

  private async getDailyMetrics(
    projectId: string | undefined,
    runSourceWhere: Prisma.WorkflowRunWhereInput,
    usePreaggregated: boolean,
  ) {
    const todayMetric = await this.aggregateTodayMetric(projectId, runSourceWhere)

    if (usePreaggregated) {
      const persisted = await this.prisma.dailyMetric.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { date: 'asc' },
        take: 30,
      })
      const persistedRows = persisted.map((m) => ({
        date: m.date.toISOString().split('T')[0],
        calls: m.calls,
        tokens: m.tokens,
        cost: Number(m.cost),
        avgLatency: Number(m.avgLatency),
        errors: m.errors,
      }))
      return todayMetric
        ? [...persistedRows.filter((m) => m.date !== todayMetric.date), todayMetric]
        : persistedRows
    }

    return this.aggregateDailyMetricsFromRuns(projectId, runSourceWhere)
  }

  private async aggregateDailyMetricsFromRuns(
    projectId: string | undefined,
    runSourceWhere: Prisma.WorkflowRunWhereInput,
  ) {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - 29)

    const runs = await this.prisma.workflowRun.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        startedAt: { gte: start },
        ...runSourceWhere,
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
      { calls: number; tokens: number; cost: number; totalLatency: number; errors: number }
    >()
    for (let i = 0; i < 30; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      buckets.set(d.toISOString().split('T')[0], {
        calls: 0,
        tokens: 0,
        cost: 0,
        totalLatency: 0,
        errors: 0,
      })
    }

    for (const r of runs) {
      const key = r.startedAt.toISOString().split('T')[0]
      const b = buckets.get(key)
      if (!b) continue
      b.calls += 1
      b.tokens += r.totalTokens ?? 0
      b.cost += Number(r.totalCost ?? 0)
      b.totalLatency += r.latencyMs ?? 0
      if (r.status === 'failed') b.errors += 1
    }

    return Array.from(buckets.entries()).map(([date, b]) => ({
      date,
      calls: b.calls,
      tokens: b.tokens,
      cost: b.cost,
      avgLatency: b.calls > 0 ? b.totalLatency / b.calls : 0,
      errors: b.errors,
    }))
  }

  private async aggregateTodayMetric(
    projectId: string | undefined,
    runSourceWhere: Prisma.WorkflowRunWhereInput,
  ) {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const where: Prisma.WorkflowRunWhereInput = {
      ...(projectId ? { projectId } : {}),
      startedAt: { gte: todayStart },
      ...runSourceWhere,
    }

    const [agg, errorCount] = await Promise.all([
      this.prisma.workflowRun.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, totalCost: true, latencyMs: true },
      }),
      this.prisma.workflowRun.count({ where: { ...where, status: 'failed' } }),
    ])

    const calls = agg._count._all ?? 0
    if (calls === 0) return null

    const totalLatency = agg._sum.latencyMs ?? 0
    return {
      date: todayStart.toISOString().split('T')[0],
      calls,
      tokens: agg._sum.totalTokens ?? 0,
      cost: Number(agg._sum.totalCost ?? 0),
      avgLatency: calls > 0 ? totalLatency / calls : 0,
      errors: errorCount,
    }
  }
}
