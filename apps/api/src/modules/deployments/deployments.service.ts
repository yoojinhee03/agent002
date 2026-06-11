import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateDeploymentDto } from './dto/create-deployment.dto'

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.deployment.findMany({
      where: { projectId },
      include: {
        workflow: true,
        version: true,
        env: true,
        endpoints: true,
      },
      orderBy: { deployedAt: 'desc' },
    })
  }

  async deploy(projectId: string, data: CreateDeploymentDto) {
    const [workflow, project, environment] = await Promise.all([
      this.prisma.workflow.findUnique({ where: { id: data.workflowId } }),
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.deploymentEnvironment.findUnique({ where: { id: data.environmentId } }),
    ])

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID "${data.workflowId}" not found`)
    }
    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`)
    }
    if (!environment) {
      throw new NotFoundException(`Environment with ID "${data.environmentId}" not found`)
    }

    const endpointPath = `/api/v1/workflows/${project.slug}/${workflow.slug}/${environment.slug}/run`

    // Use variables from version snapshot (source of truth), fallback to workflow
    const snapshotVars = data.snapshot?.variables ?? []
    const variables = snapshotVars.length > 0 ? snapshotVars : (workflow.variables ?? [])

    const existing = await this.prisma.deployment.findUnique({
      where: {
        workflowId_environmentId: {
          workflowId: data.workflowId,
          environmentId: data.environmentId,
        },
      },
      include: { endpoints: true },
    })

    let deployment
    let endpoint

    if (existing) {
      deployment = await this.prisma.deployment.update({
        where: { id: existing.id },
        data: {
          versionId: data.versionId,
          versionNumber: data.versionNumber,
          status: 'active',
          deployedBy: data.deployedBy,
          deployedAt: new Date(),
          endpointPath,
        },
        include: { endpoints: true },
      })

      const existingEndpoint = existing.endpoints[0]
      if (existingEndpoint) {
        endpoint = await this.prisma.endpoint.update({
          where: { id: existingEndpoint.id },
          data: {
            projectSlug: project.slug,
            path: endpointPath,
            status: 'active',
            versionId: data.versionId,
            versionNumber: data.versionNumber,
            variables,
            description: workflow.description,
          },
        })
      } else {
        endpoint = await this.prisma.endpoint.create({
          data: {
            deployment: { connect: { id: deployment.id } },
            workflow: { connect: { id: data.workflowId } },
            version: { connect: { id: data.versionId } },
            workflowName: workflow.name,
            projectSlug: project.slug,
            workflowSlug: workflow.slug,
            path: endpointPath,
            method: 'POST',
            environment: data.environment,
            versionNumber: data.versionNumber,
            variables,
            description: workflow.description,
            status: 'active',
          },
        })
      }
    } else {
      deployment = await this.prisma.deployment.create({
        data: {
          projectId,
          workflowId: data.workflowId,
          workflowName: workflow.name,
          environmentId: data.environmentId,
          environment: data.environment,
          versionId: data.versionId,
          versionNumber: data.versionNumber,
          status: 'active',
          deployedBy: data.deployedBy,
          deployedAt: new Date(),
          endpointPath,
        },
        include: { endpoints: true },
      })

      endpoint = await this.prisma.endpoint.create({
        data: {
          deployment: { connect: { id: deployment.id } },
          workflow: { connect: { id: data.workflowId } },
          version: { connect: { id: data.versionId } },
          workflowName: workflow.name,
          projectSlug: project.slug,
          workflowSlug: workflow.slug,
          path: endpointPath,
          method: 'POST',
          environment: data.environment,
          versionNumber: data.versionNumber,
          variables,
          description: workflow.description,
          status: 'active',
        },
      })
    }

    await this.prisma.deploymentLog.create({
      data: {
        projectId,
        workflowId: data.workflowId,
        workflowName: workflow.name,
        action: 'deploy',
        environment: data.environment,
        toVersion: data.versionNumber,
        performedBy: data.deployedBy,
        performedAt: new Date(),
      },
    })

    return { deployment, endpoint }
  }

  async undeploy(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { endpoints: true },
    })

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID "${deploymentId}" not found`)
    }

    await this.prisma.endpoint.deleteMany({
      where: { deploymentId },
    })

    await this.prisma.deploymentLog.create({
      data: {
        projectId: deployment.projectId,
        workflowId: deployment.workflowId,
        workflowName: deployment.workflowName,
        action: 'undeploy',
        environment: deployment.environment,
        fromVersion: deployment.versionNumber,
        performedBy: deployment.deployedBy,
        performedAt: new Date(),
      },
    })

    await this.prisma.deployment.delete({
      where: { id: deploymentId },
    })

    return { success: true }
  }

  async getLogs(projectId: string) {
    return this.prisma.deploymentLog.findMany({
      where: { projectId },
      orderBy: { performedAt: 'desc' },
    })
  }
}
