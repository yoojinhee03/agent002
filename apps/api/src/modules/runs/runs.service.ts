import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class RunsService {
  constructor(private prisma: PrismaService) {}

  async listByWorkflow(workflowId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize
    const [runs, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where: { workflowId },
        orderBy: { startedAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          workflowId: true,
          status: true,
          input: true,
          output: true,
          errorMessage: true,
          totalCost: true,
          totalTokens: true,
          totalSteps: true,
          startedAt: true,
          completedAt: true,
          environment: true,
        },
      }),
      this.prisma.workflowRun.count({ where: { workflowId } }),
    ])
    return { runs, total, page, pageSize }
  }

  async getById(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        traces: { orderBy: { startedAt: 'asc' } },
      },
    })
    if (!run) throw new NotFoundException('Run not found')
    return run
  }

  async getTraces(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } })
    if (!run) throw new NotFoundException('Run not found')

    return this.prisma.stepTrace.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    })
  }
}
