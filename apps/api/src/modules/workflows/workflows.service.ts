import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { UpdateWorkflowDto } from './dto/update-workflow.dto'
import { CreateVersionDto } from './dto/create-version.dto'

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  async list(projectId: string) {
    return this.prisma.workflow.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async getById(id: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id } })
    if (!workflow) throw new NotFoundException('Workflow not found')
    return workflow
  }

  async create(projectId: string, dto: CreateWorkflowDto) {
    const existing = await this.prisma.workflow.findFirst({
      where: { projectId, slug: dto.slug },
    })
    if (existing) throw new ConflictException('Slug already exists in this project')

    return this.prisma.workflow.create({
      data: {
        projectId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? '',
        nodes: (dto.nodes as object[]) ?? [],
        edges: (dto.edges as object[]) ?? [],
        variables: (dto.variables as object[]) ?? [],
        status: 'draft',
      },
    })
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    await this.getById(id)
    return this.prisma.workflow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.nodes !== undefined && { nodes: dto.nodes as object[] }),
        ...(dto.edges !== undefined && { edges: dto.edges as object[] }),
        ...(dto.variables !== undefined && { variables: dto.variables as object[] }),
      },
    })
  }

  async delete(id: string) {
    await this.getById(id)
    await this.prisma.workflow.delete({ where: { id } })
    return { success: true }
  }

  async checkSlug(projectId: string, slug: string, excludeId?: string) {
    const existing = await this.prisma.workflow.findFirst({
      where: { projectId, slug, ...(excludeId && { id: { not: excludeId } }) },
    })
    return { available: !existing }
  }

  // ============================================================
  // Versions
  // ============================================================

  async getVersionById(versionId: string) {
    const version = await this.prisma.workflowVersion.findUnique({
      where: { id: versionId },
      include: { creator: { select: { id: true, name: true, email: true } } },
    })
    if (!version) throw new NotFoundException('Version not found')
    return version
  }

  async listVersions(workflowId: string) {
    return this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { number: 'desc' },
      include: { creator: { select: { id: true, name: true, email: true } } },
    })
  }

  async createVersion(workflowId: string, dto: CreateVersionDto) {
    await this.getById(workflowId)

    const latest = await this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { number: 'desc' },
    })
    const number = (latest?.number ?? 0) + 1

    // 이전 버전과의 diff 계산
    const diff = latest
      ? this.calculateDiff(latest.snapshot as Record<string, unknown[]>, dto.snapshot)
      : null

    return this.prisma.workflowVersion.create({
      data: {
        workflowId,
        number,
        label: dto.label,
        message: dto.message,
        snapshot: dto.snapshot as any,
        diff: diff as any,
        createdBy: dto.createdBy,
      },
    })
  }

  async rollback(workflowId: string, versionId: string) {
    const version = await this.prisma.workflowVersion.findUnique({
      where: { id: versionId },
    })
    if (!version) throw new NotFoundException('Version not found')

    const snapshot = version.snapshot as { nodes: unknown[]; edges: unknown[]; variables: unknown[] }

    // 워크플로우를 해당 버전 스냅샷으로 복원
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        nodes: snapshot.nodes as object[],
        edges: snapshot.edges as object[],
        variables: snapshot.variables as object[],
      },
    })

    // 새 버전으로 기록
    return this.createVersion(workflowId, {
      message: `Rollback to v${version.number}`,
      snapshot,
      createdBy: 'system',
    })
  }

  private calculateDiff(
    prev: Record<string, unknown[]>,
    next: { nodes: unknown[]; edges: unknown[]; variables: unknown[] },
  ) {
    const prevNodes = (prev.nodes as { id: string }[]) ?? []
    const nextNodes = (next.nodes as { id: string }[]) ?? []
    const prevIds = new Set(prevNodes.map((n) => n.id))
    const nextIds = new Set(nextNodes.map((n) => n.id))

    return {
      nodesAdded: nextNodes.filter((n) => !prevIds.has(n.id)).length,
      nodesRemoved: prevNodes.filter((n) => !nextIds.has(n.id)).length,
      nodesModified: nextNodes.filter((n) => prevIds.has(n.id)).length,
      edgesChanged: Math.abs((next.edges?.length ?? 0) - (prev.edges?.length ?? 0)),
    }
  }
}
