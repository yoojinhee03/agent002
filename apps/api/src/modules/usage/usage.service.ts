import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  apiKeySourceWhere,
  buildRunSourceWhere,
  type RunSource,
} from '../../common/run-source'

function endOfDay(input: string | Date): Date {
  const d = new Date(input)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

export interface DailyMetricDto {
  date: string
  calls: number
  tokens: number
  cost: number
  avgLatency: number
  errors: number
}

export interface InsightDto {
  id: string
  icon: string
  severity: 'info' | 'warning' | 'success' | 'critical'
  title: string
  description: string
  metric?: string
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalUsage(from: string, to: string, source: RunSource = 'all') {
    const startDate = new Date(from)
    const endDate = endOfDay(to)
    const sourceWhere = await buildRunSourceWhere(this.prisma, source)

    const summary = await this.aggregateSummary({ startDate, endDate, sourceWhere })
    const dailyMetrics = await this.aggregateDailyMetrics({ startDate, endDate, source, sourceWhere })
    const agentCards = await this.aggregateAgentCards({ startDate, endDate, sourceWhere })
    const providerBreakdown = await this.aggregateProviderBreakdown({ startDate, endDate, sourceWhere })
    const environmentDistribution = await this.aggregateEnvironmentDistribution({ startDate, endDate, sourceWhere })
    const insights = this.buildInsights({ summary, dailyMetrics, agentCards })

    return {
      summary,
      dailyMetrics,
      agentCards,
      providerBreakdown,
      environmentDistribution,
      insights,
    }
  }

  async getProjectUsage(projectId: string, from: string, to: string, source: RunSource = 'all') {
    const startDate = new Date(from)
    const endDate = endOfDay(to)
    const sourceWhere = await buildRunSourceWhere(this.prisma, source)

    const summary = await this.aggregateSummary({ projectId, startDate, endDate, sourceWhere })
    const dailyMetrics = await this.aggregateDailyMetrics({ projectId, startDate, endDate, source, sourceWhere })
    const environmentDistribution = await this.aggregateEnvironmentDistribution({ projectId, startDate, endDate, sourceWhere })
    const promptEndpointTree = await this.buildPromptEndpointTree(projectId, startDate, endDate, sourceWhere)
    const apiKeyActivity = await this.buildApiKeyActivity(projectId, startDate, endDate, source, sourceWhere)
    const recentLogs = await this.buildRecentLogs(projectId, startDate, endDate, sourceWhere)
    const insights = this.buildInsights({ summary, dailyMetrics })

    return {
      summary,
      dailyMetrics,
      promptEndpointTree,
      apiKeyActivity,
      environmentDistribution,
      insights,
      recentLogs,
    }
  }

  async getExecutionLogs(
    filters: { workflowId?: string; endpointId?: string; apiKeyId?: string; source?: RunSource },
    from: string,
    to: string,
    page: number,
    pageSize: number,
  ) {
    const startDate = new Date(from)
    const endDate = endOfDay(to)

    const sourceWhere = await buildRunSourceWhere(this.prisma, filters.source ?? 'all')
    const where: Prisma.WorkflowRunWhereInput = {
      startedAt: { gte: startDate, lte: endDate },
      ...(filters.workflowId && { workflowId: filters.workflowId }),
      ...(filters.endpointId && { endpointId: filters.endpointId }),
      ...(filters.apiKeyId && { apiKeyId: filters.apiKeyId }),
      ...sourceWhere,
    }

    const [runsRaw, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where,
        include: { workflow: true, endpoint: true, apiKey: true, agent: true },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workflowRun.count({ where }),
    ])

    const logs = runsRaw.map((run) => this.runToLogEntry(run))
    return { logs, total }
  }

  // ------------------------------------------------------------------
  // Aggregation helpers
  // ------------------------------------------------------------------

  private async aggregateSummary(params: { projectId?: string; startDate: Date; endDate: Date; sourceWhere: Prisma.WorkflowRunWhereInput }) {
    const { projectId, startDate, endDate, sourceWhere } = params
    const where: Prisma.WorkflowRunWhereInput = {
      startedAt: { gte: startDate, lte: endDate },
      ...(projectId && { projectId }),
      ...sourceWhere,
    }

    const [agg, errorCount] = await Promise.all([
      this.prisma.workflowRun.aggregate({
        where,
        _count: true,
        _sum: { totalTokens: true, totalCost: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.workflowRun.count({ where: { ...where, status: 'failed' } }),
    ])

    const totalCalls = agg._count ?? 0
    const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0
    return {
      totalCalls,
      totalTokens: agg._sum?.totalTokens ?? 0,
      totalCost: Number(agg._sum?.totalCost ?? 0),
      avgLatency: Math.round(agg._avg?.latencyMs ?? 0),
      errorRate: Math.round(errorRate * 100) / 100,
      period: this.formatPeriod(startDate, endDate),
    }
  }

  private async aggregateDailyMetrics(params: { projectId?: string; startDate: Date; endDate: Date; source: RunSource; sourceWhere: Prisma.WorkflowRunWhereInput }): Promise<DailyMetricDto[]> {
    const { projectId, startDate, endDate, source, sourceWhere } = params

    if (source === 'all') {
      const startDay = this.startOfDayUtc(startDate)
      const endDay = this.startOfDayUtc(endDate)

      const rows = await this.prisma.dailyMetric.findMany({
        where: {
          date: { gte: startDay, lte: endDay },
          ...(projectId && { projectId }),
        },
        orderBy: { date: 'asc' },
      })

      const grouped = new Map<
        string,
        { calls: number; tokens: number; cost: number; latencySum: number; errors: number }
      >()
      for (const m of rows) {
        const key = m.date.toISOString().split('T')[0]
        const acc = grouped.get(key) ?? { calls: 0, tokens: 0, cost: 0, latencySum: 0, errors: 0 }
        acc.calls += m.calls
        acc.tokens += m.tokens
        acc.cost += Number(m.cost)
        acc.latencySum += Number(m.avgLatency) * m.calls
        acc.errors += m.errors
        grouped.set(key, acc)
      }

      return Array.from(grouped.entries()).map(([date, v]) => ({
        date,
        calls: v.calls,
        tokens: v.tokens,
        cost: v.cost,
        avgLatency: v.calls > 0 ? Math.round(v.latencySum / v.calls) : 0,
        errors: v.errors,
      }))
    }

    const runs = await this.prisma.workflowRun.findMany({
      where: {
        startedAt: { gte: startDate, lte: endDate },
        ...(projectId && { projectId }),
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

    const grouped = new Map<
      string,
      { calls: number; tokens: number; cost: number; latencySum: number; errors: number }
    >()
    for (const r of runs) {
      const key = this.startOfDayUtc(r.startedAt).toISOString().split('T')[0]
      const acc = grouped.get(key) ?? { calls: 0, tokens: 0, cost: 0, latencySum: 0, errors: 0 }
      acc.calls += 1
      acc.tokens += r.totalTokens ?? 0
      acc.cost += Number(r.totalCost ?? 0)
      acc.latencySum += r.latencyMs ?? 0
      if (r.status === 'failed') acc.errors += 1
      grouped.set(key, acc)
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        calls: v.calls,
        tokens: v.tokens,
        cost: v.cost,
        avgLatency: v.calls > 0 ? Math.round(v.latencySum / v.calls) : 0,
        errors: v.errors,
      }))
  }

  private async aggregateAgentCards(params: { startDate: Date; endDate: Date; sourceWhere: Prisma.WorkflowRunWhereInput }) {
    const { startDate, endDate, sourceWhere } = params
    const agents = await this.prisma.agent.findMany({ select: { id: true, name: true } })

    const agentIds = agents.map((a) => a.id)
    if (agentIds.length === 0) return []

    const sparkStartDay = this.shiftDays(this.startOfDayUtc(endDate), -6)

    const [aggGroups, errGroups, dailySpark] = await Promise.all([
      this.prisma.workflowRun.groupBy({
        by: ['agentId'],
        where: { agentId: { in: agentIds }, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
        _count: true,
        _sum: { totalTokens: true, totalCost: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.workflowRun.groupBy({
        by: ['agentId'],
        where: { agentId: { in: agentIds }, startedAt: { gte: startDate, lte: endDate }, status: 'failed', ...sourceWhere },
        _count: true,
      }),
      this.prisma.workflowRun.findMany({
        where: { agentId: { in: agentIds }, startedAt: { gte: sparkStartDay, lte: endDate }, ...sourceWhere },
        select: { agentId: true, startedAt: true },
      }),
    ])

    const aggMap = new Map(aggGroups.map((g) => [g.agentId ?? '', g]))
    const errMap = new Map(errGroups.map((g) => [g.agentId ?? '', g._count]))

    const sparkMap = new Map<string, Map<string, number>>()
    for (const row of dailySpark) {
      if (!row.agentId) continue
      const dayKey = this.startOfDayUtc(row.startedAt).toISOString().split('T')[0]
      const inner = sparkMap.get(row.agentId) ?? new Map<string, number>()
      inner.set(dayKey, (inner.get(dayKey) ?? 0) + 1)
      sparkMap.set(row.agentId, inner)
    }

    const sparkDays: string[] = []
    for (let i = 6; i >= 0; i--) {
      sparkDays.push(this.shiftDays(this.startOfDayUtc(endDate), -i).toISOString().split('T')[0])
    }

    return agents.map((a) => {
      const agg = aggMap.get(a.id)
      const calls = agg?._count ?? 0
      const errors = errMap.get(a.id) ?? 0
      const totalTokens = agg?._sum?.totalTokens ?? 0
      const cost = Number(agg?._sum?.totalCost ?? 0)
      const avgLatency = Math.round(agg?._avg?.latencyMs ?? 0)
      const errorRate = calls > 0 ? Math.round((errors / calls) * 10000) / 100 : 0
      const inner = sparkMap.get(a.id) ?? new Map<string, number>()
      const sparkline = sparkDays.map((d) => inner.get(d) ?? 0)

      return {
        agentId: a.id,
        agentName: a.name,
        calls,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens,
        cost,
        avgLatency,
        errorRate,
        sparkline,
        environmentSplit: { prod: 0, staging: 0, dev: 0 },
      }
    })
  }

  private async aggregateProviderBreakdown(params: { projectId?: string; startDate: Date; endDate: Date; sourceWhere: Prisma.WorkflowRunWhereInput }) {
    const { projectId, startDate, endDate, sourceWhere } = params

    const groups = await this.prisma.workflowRun.groupBy({
      by: ['modelId'],
      where: {
        startedAt: { gte: startDate, lte: endDate },
        modelId: { not: null },
        ...(projectId && { projectId }),
        ...sourceWhere,
      },
      _count: true,
      _sum: { totalTokens: true, totalCost: true },
    })

    if (groups.length === 0) return []

    const modelIds = groups.map((g) => g.modelId).filter((m): m is string => m !== null)
    const models = await this.prisma.model.findMany({
      where: { modelId: { in: modelIds } },
      select: {
        modelId: true,
        name: true,
        provider: { select: { id: true, name: true, slug: true } },
      },
    })

    const modelInfoMap = new Map<string, { name: string; provider: { id: string; name: string; slug: string } | null }>()
    for (const m of models) {
      if (!modelInfoMap.has(m.modelId)) {
        modelInfoMap.set(m.modelId, { name: m.name, provider: m.provider })
      }
    }

    const totalCost = groups.reduce((s, g) => s + Number(g._sum?.totalCost ?? 0), 0)

    return groups
      .map((g) => {
        const info = modelInfoMap.get(g.modelId ?? '')
        const cost = Number(g._sum?.totalCost ?? 0)
        return {
          modelId: g.modelId ?? '',
          modelName: info?.name ?? g.modelId ?? 'unknown',
          providerId: info?.provider?.id ?? null,
          providerName: info?.provider?.name ?? 'Unknown',
          providerSlug: info?.provider?.slug ?? null,
          calls: g._count ?? 0,
          totalTokens: g._sum?.totalTokens ?? 0,
          cost,
          costPercentage: totalCost > 0 ? Math.round((cost / totalCost) * 10000) / 100 : 0,
        }
      })
      .sort((a, b) => b.cost - a.cost)
  }

  private async aggregateEnvironmentDistribution(params: { projectId?: string; startDate: Date; endDate: Date; sourceWhere: Prisma.WorkflowRunWhereInput }) {
    const { projectId, startDate, endDate, sourceWhere } = params
    const groups = await this.prisma.workflowRun.groupBy({
      by: ['environment'],
      where: {
        startedAt: { gte: startDate, lte: endDate },
        ...(projectId && { projectId }),
        ...sourceWhere,
      },
      _count: true,
      _sum: { totalTokens: true, totalCost: true },
    })

    const total = groups.reduce((s, g) => s + (g._count ?? 0), 0)
    return groups.map((g) => ({
      environment: g.environment ?? 'production',
      calls: g._count ?? 0,
      tokens: g._sum?.totalTokens ?? 0,
      cost: Number(g._sum?.totalCost ?? 0),
      percentage: total > 0 ? Math.round(((g._count ?? 0) / total) * 10000) / 100 : 0,
    }))
  }

  private buildInsights(params: {
    summary: { totalCalls: number; totalCost: number; errorRate: number; avgLatency: number }
    dailyMetrics: DailyMetricDto[]
    agentCards?: { agentName: string; cost: number; calls: number }[]
  }): InsightDto[] {
    const { summary, dailyMetrics, agentCards } = params
    const insights: InsightDto[] = []

    if (summary.errorRate >= 5 && summary.totalCalls > 0) {
      insights.push({
        id: 'high-error-rate',
        icon: 'AlertTriangle',
        severity: summary.errorRate >= 15 ? 'critical' : 'warning',
        title: '높은 에러율 감지',
        description: `최근 기간 전체 에러율이 ${summary.errorRate.toFixed(2)}%입니다. 실패한 호출을 확인하세요.`,
        metric: `${summary.errorRate.toFixed(2)}%`,
      })
    }

    if (dailyMetrics.length >= 2) {
      const last = dailyMetrics[dailyMetrics.length - 1]
      const prev = dailyMetrics[dailyMetrics.length - 2]
      if (prev.cost > 0 && last.cost > prev.cost * 1.5) {
        const delta = ((last.cost - prev.cost) / prev.cost) * 100
        insights.push({
          id: 'cost-spike',
          icon: 'TrendingUp',
          severity: 'info',
          title: '비용 급증',
          description: `${last.date} 비용이 직전일 대비 ${delta.toFixed(0)}% 증가했습니다.`,
          metric: `+${delta.toFixed(0)}%`,
        })
      }
    }

    if (agentCards && agentCards.length > 0) {
      const top = [...agentCards].sort((a, b) => b.cost - a.cost)[0]
      if (top && top.cost > 0) {
        insights.push({
          id: 'cost-leader',
          icon: 'DollarSign',
          severity: 'info',
          title: '비용 1위 에이전트',
          description: `${top.agentName}이(가) 가장 많은 비용을 소비했습니다.`,
          metric: `$${top.cost.toFixed(2)}`,
        })
      }
    }

    return insights
  }

  // ------------------------------------------------------------------
  // Project-level helpers (promptEndpointTree, apiKeyActivity, recentLogs)
  // ------------------------------------------------------------------

  private async buildPromptEndpointTree(projectId: string, startDate: Date, endDate: Date, sourceWhere: Prisma.WorkflowRunWhereInput) {
    const workflows = await this.prisma.workflow.findMany({
      where: { projectId },
      select: { id: true, name: true },
    })
    if (workflows.length === 0) return []

    const wfIds = workflows.map((w) => w.id)
    const endpoints = await this.prisma.endpoint.findMany({
      where: { workflowId: { in: wfIds } },
      select: { id: true, path: true, environment: true, status: true, workflowId: true },
    })
    const endpointsByWorkflow = new Map<string, typeof endpoints>()
    for (const e of endpoints) {
      const arr = endpointsByWorkflow.get(e.workflowId) ?? []
      arr.push(e)
      endpointsByWorkflow.set(e.workflowId, arr)
    }
    const epIds = endpoints.map((e) => e.id)

    const [wfAgg, wfErr, epAgg, epErr] = await Promise.all([
      this.prisma.workflowRun.groupBy({
        by: ['workflowId'],
        where: { workflowId: { in: wfIds }, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
        _count: true,
        _sum: { totalTokens: true, totalCost: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.workflowRun.groupBy({
        by: ['workflowId'],
        where: { workflowId: { in: wfIds }, startedAt: { gte: startDate, lte: endDate }, status: 'failed', ...sourceWhere },
        _count: true,
      }),
      epIds.length === 0
        ? Promise.resolve([])
        : this.prisma.workflowRun.groupBy({
            by: ['endpointId', 'workflowId'],
            where: { endpointId: { in: epIds }, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
            _count: true,
            _sum: { totalTokens: true, totalCost: true },
            _avg: { latencyMs: true },
          }),
      epIds.length === 0
        ? Promise.resolve([])
        : this.prisma.workflowRun.groupBy({
            by: ['endpointId', 'workflowId'],
            where: { endpointId: { in: epIds }, startedAt: { gte: startDate, lte: endDate }, status: 'failed', ...sourceWhere },
            _count: true,
          }),
    ])

    const wfAggMap = new Map(wfAgg.map((a) => [a.workflowId ?? '', a]))
    const wfErrMap = new Map(wfErr.map((a) => [a.workflowId ?? '', a._count]))
    const epAggMap = new Map(epAgg.map((a) => [`${a.workflowId ?? ''}|${a.endpointId ?? ''}`, a]))
    const epErrMap = new Map(epErr.map((a) => [`${a.workflowId ?? ''}|${a.endpointId ?? ''}`, a._count]))

    return workflows.map((w) => {
      const a = wfAggMap.get(w.id)
      const calls = a?._count ?? 0
      const errors = wfErrMap.get(w.id) ?? 0
      return {
        promptId: w.id,
        promptName: w.name,
        calls,
        totalTokens: a?._sum?.totalTokens ?? 0,
        cost: Number(a?._sum?.totalCost ?? 0),
        avgLatency: Math.round(a?._avg?.latencyMs ?? 0),
        errorRate: calls > 0 ? Math.round((errors / calls) * 10000) / 100 : 0,
        endpoints: (endpointsByWorkflow.get(w.id) ?? []).map((e) => {
          const ea = epAggMap.get(`${w.id}|${e.id}`)
          const eCalls = ea?._count ?? 0
          const eErrors = epErrMap.get(`${w.id}|${e.id}`) ?? 0
          return {
            endpointId: e.id,
            endpointPath: e.path,
            environment: e.environment ?? 'production',
            modelId: '',
            modelName: '',
            calls: eCalls,
            cost: Number(ea?._sum?.totalCost ?? 0),
            avgLatency: Math.round(ea?._avg?.latencyMs ?? 0),
            errorRate: eCalls > 0 ? Math.round((eErrors / eCalls) * 10000) / 100 : 0,
            status: (e.status ?? 'active') as 'active' | 'paused' | 'inactive',
          }
        }),
      }
    })
  }

  private async buildApiKeyActivity(projectId: string, startDate: Date, endDate: Date, source: RunSource, sourceWhere: Prisma.WorkflowRunWhereInput) {
    const keys = await this.prisma.apiKey.findMany({
      where: { projectId, ...apiKeySourceWhere(source) },
      select: { id: true, name: true, keyPrefix: true, keySuffix: true, status: true, lastUsedAt: true, environment: true },
    })
    if (keys.length === 0) return []

    const keyIds = keys.map((k) => k.id)
    const agg = await this.prisma.workflowRun.groupBy({
      by: ['apiKeyId'],
      where: { apiKeyId: { in: keyIds }, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
      _count: true,
      _sum: { totalTokens: true, totalCost: true },
      _avg: { latencyMs: true },
    })
    const err = await this.prisma.workflowRun.groupBy({
      by: ['apiKeyId'],
      where: { apiKeyId: { in: keyIds }, startedAt: { gte: startDate, lte: endDate }, status: 'failed', ...sourceWhere },
      _count: true,
    })
    const aggMap = new Map(agg.map((a) => [a.apiKeyId ?? '', a]))
    const errMap = new Map(err.map((a) => [a.apiKeyId ?? '', a._count]))

    const epRows = await this.prisma.workflowRun.findMany({
      where: { apiKeyId: { in: keyIds }, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
      select: { apiKeyId: true, endpoint: { select: { path: true } } },
      take: 500,
    })
    const epPathMap = new Map<string, Set<string>>()
    for (const row of epRows) {
      if (!row.apiKeyId || !row.endpoint?.path) continue
      const set = epPathMap.get(row.apiKeyId) ?? new Set()
      set.add(row.endpoint.path)
      epPathMap.set(row.apiKeyId, set)
    }

    return keys.map((k) => {
      const a = aggMap.get(k.id)
      const calls = a?._count ?? 0
      const errors = errMap.get(k.id) ?? 0
      const status = (k.status === 'revoked' || k.status === 'expired') ? k.status : 'active'
      return {
        apiKeyId: k.id,
        apiKeyName: k.name,
        keyMasked: `${k.keyPrefix}...${k.keySuffix}`,
        environment: k.environment ?? 'production',
        calls,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: a?._sum?.totalTokens ?? 0,
        cost: Number(a?._sum?.totalCost ?? 0),
        avgLatency: Math.round(a?._avg?.latencyMs ?? 0),
        errorRate: calls > 0 ? Math.round((errors / calls) * 10000) / 100 : 0,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        status: status as 'active' | 'revoked' | 'expired',
        accessedEndpointPaths: Array.from(epPathMap.get(k.id) ?? []),
      }
    })
  }

  private async buildRecentLogs(projectId: string, startDate: Date, endDate: Date, sourceWhere: Prisma.WorkflowRunWhereInput) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { projectId, startedAt: { gte: startDate, lte: endDate }, ...sourceWhere },
      include: { workflow: true, endpoint: true, apiKey: true, agent: true },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return runs.map((run) => this.runToLogEntry(run))
  }

  private runToLogEntry(run: {
    id: string
    workflowId: string | null
    agentId: string | null
    workflow?: { name: string } | null
    agent?: { name: string } | null
    endpoint?: { path: string } | null
    apiKey?: { name: string } | null
    input: unknown
    output: unknown
    totalTokens: number | null
    totalCost: number | null
    latencyMs: number | null
    status: string
    errorMessage: string | null
    startedAt: Date
    endpointId: string | null
    apiKeyId: string | null
    environment: string | null
  }) {
    const input = (run.input ?? {}) as Record<string, unknown>
    const output = (run.output ?? {}) as Record<string, unknown>
    return {
      id: run.id,
      promptId: run.workflowId || run.agentId || '',
      promptName: run.workflow?.name || run.agent?.name || 'Deepagent Chat',
      model: '',
      userQuery: typeof input.text === 'string' ? input.text : (typeof input.query === 'string' ? input.query : ''),
      response: typeof output.text === 'string' ? output.text : (typeof output.response === 'string' ? output.response : ''),
      inputTokens: 0,
      outputTokens: 0,
      latency: run.latencyMs ?? 0,
      tokens: run.totalTokens ?? 0,
      cost: Number(run.totalCost ?? 0),
      status: (run.status === 'completed' ? 'success' : 'error') as 'success' | 'error',
      errorMessage: run.errorMessage ?? undefined,
      createdAt: run.startedAt.toISOString(),
      endpointId: run.endpointId ?? undefined,
      endpointPath: run.endpoint?.path ?? undefined,
      environment: run.environment ?? undefined,
      apiKeyId: run.apiKeyId ?? undefined,
      apiKeyName: run.apiKey?.name ?? undefined,
    }
  }

  // ------------------------------------------------------------------
  // Date helpers
  // ------------------------------------------------------------------

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

  private formatPeriod(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime()
    const days = Math.max(1, Math.round(ms / 86400000))
    return `최근 ${days}일`
  }
}
