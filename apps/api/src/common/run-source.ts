import type { Prisma, PrismaClient } from '@prisma/client'

export type RunSource = 'all' | 'studio' | 'client'

export function normalizeRunSource(value?: string | null): RunSource {
  if (value === 'studio' || value === 'client') return value
  return 'all'
}

export function apiKeySourceWhere(source: RunSource): Prisma.ApiKeyWhereInput {
  if (source === 'client') return { agentDeploymentId: { not: null } }
  if (source === 'studio') return { agentDeploymentId: null }
  return {}
}

/**
 * WorkflowRun 의 source 필터.
 * thread.agentDeploymentId IS NOT NULL → client.
 * Prisma 스키마에 thread 관계가 없으므로 thread id 셋을 미리 조회해서 합성한다.
 */
export async function buildRunSourceWhere(
  prisma: Pick<PrismaClient, 'thread'>,
  source: RunSource,
): Promise<Prisma.WorkflowRunWhereInput> {
  if (source === 'all') return {}

  const clientThreads = await prisma.thread.findMany({
    where: { agentDeploymentId: { not: null } },
    select: { id: true },
  })
  const clientThreadIds = clientThreads.map((t) => t.id)

  if (source === 'client') {
    if (clientThreadIds.length === 0) {
      return { id: '__none__' }
    }
    return { threadId: { in: clientThreadIds } }
  }

  if (clientThreadIds.length === 0) return {}
  return {
    OR: [
      { threadId: null },
      { threadId: { notIn: clientThreadIds } },
    ],
  }
}
