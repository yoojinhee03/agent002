import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.deploymentEnvironment.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async create(projectId: string, data: CreateEnvironmentDto) {
    return this.prisma.deploymentEnvironment.create({
      data: {
        ...data,
        projectId,
      },
    });
  }

  async update(id: string, data: UpdateEnvironmentDto) {
    const env = await this.prisma.deploymentEnvironment.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!env) throw new NotFoundException(`Environment with ID "${id}" not found`);

    const updated = await this.prisma.deploymentEnvironment.update({
      where: { id },
      data,
    });

    // If slug changed, propagate new paths to all deployments & endpoints
    if (data.slug && data.slug !== env.slug) {
      const newSlug = data.slug;
      const projectSlug = env.project.slug;

      const deployments = await this.prisma.deployment.findMany({
        where: { environmentId: id },
        include: { endpoints: true, workflow: true },
      });

      for (const dep of deployments) {
        const newEndpointPath = `/api/v1/workflows/${projectSlug}/${dep.workflow.slug}/${newSlug}/run`;

        await this.prisma.deployment.update({
          where: { id: dep.id },
          data: { environment: newSlug, endpointPath: newEndpointPath },
        });

        for (const ep of dep.endpoints) {
          await this.prisma.endpoint.update({
            where: { id: ep.id },
            data: { environment: newSlug, path: newEndpointPath },
          });
        }
      }
    }

    return updated;
  }

  async reorder(projectId: string, environmentIds: string[]) {
    return this.prisma.$transaction(
      environmentIds.map((id, index) =>
        this.prisma.deploymentEnvironment.update({
          where: { id, projectId },
          data: { order: index },
        }),
      ),
    );
  }

  async delete(id: string) {
    return this.prisma.deploymentEnvironment.delete({ where: { id } });
  }
}
