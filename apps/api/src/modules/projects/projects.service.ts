import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { DuplicateProjectDto } from './dto/duplicate-project.dto'
import { MemberRole, MemberStatus, ProjectVisibility } from '@prisma/client'

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userEmail?: string, membersOnly?: boolean) {
    const where: any = {}

    if (userEmail) {
      if (membersOnly) {
        // Only projects where user is a member
        where.members = {
          some: { email: userEmail, status: 'active' },
        }
      } else {
        // Public projects OR projects where user is a member
        where.OR = [
          { visibility: 'public' as const },
          {
            members: {
              some: { email: userEmail, status: 'active' },
            },
          },
        ]
      }
    } else {
      // Not logged in or no email: only public projects
      where.visibility = 'public' as const
    }

    try {
      const projects = await this.prisma.project.findMany({
        where,
        include: {
          members: true,
          _count: {
            select: {
              workflows: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      // Map Prisma result to shared Project type
      return projects.map((p) => ({
        ...p,
        promptCount: p._count?.workflows || 0,
        // Ensure members are properly formatted if needed
        members: p.members.map((m) => ({
          ...m,
          joinedAt: m.joinedAt?.toISOString() || null,
          invitedAt: m.invitedAt?.toISOString() || null,
        })),
      }))
    } catch (e) {
      console.error('Error in findAll projects:', e)
      throw e
    }
  }

  async findById(id: string, userEmail: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        members: true,
      },
    })

    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`)
    }

    const isMember = project.members.some(
      (m) => m.email === userEmail && m.status === 'active',
    )

    if (project.visibility === 'private' && !isMember) {
      throw new ForbiddenException('You do not have access to this project')
    }

    return project
  }

  async findBySlug(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: { members: true },
    })
    if (!project) {
      throw new NotFoundException(`Project with slug "${slug}" not found`)
    }
    return project
  }

  async create(
    data: CreateProjectDto,
    user: { id: string; email: string; name: string },
  ) {
    if (!user || !user.email) {
      throw new ForbiddenException('User information is missing or incomplete')
    }

    const { available } = await this.checkSlug(data.slug)
    if (!available) {
      throw new ConflictException(`Slug "${data.slug}" is already in use`)
    }

    const { members, ...projectData } = data

    // Ensure creator is included in the project members
    const initialMemberList = (members as any[]) || []
    const creatorEmail = user?.email || 'admin@example.com'
    const creatorName = user?.name || creatorEmail.split('@')[0]
    
    const creatorExists = initialMemberList.some((m) => m.email === creatorEmail)
    if (!creatorExists) {
      initialMemberList.push({
        name: creatorName,
        email: creatorEmail,
        role: 'admin',
        status: 'active',
        joinedAt: new Date(),
      })
    }

    // Deduplicate by email to prevent DB unique constraint violation
    const emailMap = new Map()
    for (const m of initialMemberList) {
      if (!m.email) continue
      if (!emailMap.has(m.email)) {
        emailMap.set(m.email, m)
      }
    }
    const memberList = Array.from(emailMap.values())

    try {
      const project = await this.prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            name: projectData.name,
            description: projectData.description || '',
            slug: projectData.slug,
            visibility: (projectData.visibility as ProjectVisibility) || 'private',
            allowAllModels: projectData.allowAllModels ?? true,
            allowedModelIds: projectData.allowedModelIds || [],
            defaultModelId: projectData.defaultModelId || null,
            members: {
              create: memberList.map((m) => ({
                name: m.name || m.email.split('@')[0],
                email: m.email,
                role: (m.role as MemberRole) || 'viewer',
                status: (m.status as MemberStatus) || 'active',
                joinedAt: m.joinedAt || new Date(),
                avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(m.email)}`,
              })),
            },
          },
          include: {
            members: true,
          },
        })

        // Create default environments
        await tx.deploymentEnvironment.createMany({
          data: [
            { projectId: created.id, slug: 'dev', name: 'Development', color: 'blue', order: 0 },
            { projectId: created.id, slug: 'staging', name: 'Staging', color: 'amber', order: 1 },
            { projectId: created.id, slug: 'prod', name: 'Production', color: 'emerald', order: 2 },
          ],
        })

        return created
      })

      return project
    } catch (e: any) {
      console.error('Error creating project:', e)
      if (e.code === 'P2002') {
        throw new ConflictException('A project with this slug already exists')
      }
      throw e
    }
  }

  async update(id: string, data: UpdateProjectDto, userEmail: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { members: true },
    })
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`)
    }

    const member = project.members.find(
      (m) => m.email === userEmail && m.status === 'active',
    )
    if (!member || (member.role !== 'admin' && member.role !== 'editor')) {
      throw new ForbiddenException('You do not have permission to update this project')
    }

    const { members: _members, ...updateData } = data

    // If slug is changing, we need to update all associated endpoints
    if (updateData.slug && updateData.slug !== project.slug) {
      const existingSlug = await this.prisma.project.findUnique({
        where: { slug: updateData.slug },
      })
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(`Slug "${updateData.slug}" is already in use`)
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.project.update({
          where: { id },
          data: {
            ...updateData,
            visibility: updateData.visibility as ProjectVisibility | undefined,
          },
          include: { members: true },
        })

        // Update all associated deployments and endpoints
        const deployments = await tx.deployment.findMany({
          where: { projectId: id },
          include: { workflow: true },
        })

        for (const dep of deployments) {
          const newPath = `/api/v1/workflows/${updated.slug}/${dep.workflow.slug}/${dep.environment}/run`
          
          await tx.deployment.update({
            where: { id: dep.id },
            data: { endpointPath: newPath },
          })

          await tx.endpoint.updateMany({
            where: { deploymentId: dep.id },
            data: {
              projectSlug: updated.slug,
              path: newPath,
            },
          })
        }

        return updated
      })
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        ...updateData,
        visibility: updateData.visibility as ProjectVisibility | undefined,
      },
      include: {
        members: true,
      },
    })
  }

  async delete(id: string, userEmail: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { members: true },
    })
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`)
    }

    const member = project.members.find(
      (m) => m.email === userEmail && m.status === 'active',
    )
    if (!member || member.role !== 'admin') {
      throw new ForbiddenException('Only project admins can delete this project')
    }

    await this.prisma.project.delete({ where: { id } })

    return { success: true }
  }

  async checkSlug(slug: string, excludeId?: string) {
    if (!slug) {
      return { available: true }
    }

    const existing = await this.prisma.project.findFirst({
      where: {
        slug,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })

    return { available: !existing }
  }

  async duplicate(projectId: string, data: DuplicateProjectDto, userEmail: string) {
    const selectedWorkflowIds = (data as any).selectedWorkflowIds || (data as any).selectedPromptIds || []
    
    const source = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: true,
        workflows: {
          where: {
            id: { in: selectedWorkflowIds },
          },
          include: data.copyVersions ? { versions: true } : undefined,
        },
      },
    })

    if (!source) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`)
    }

    const isMember = source.members.some(
      (m: any) => m.email === userEmail && m.status === 'active',
    )
    if (source.visibility === 'private' && !isMember) {
      throw new ForbiddenException('You do not have access to this project')
    }

    // Generate unique slug
    let newSlug = `${source.slug}-copy`
    let slugExists = await this.prisma.project.findUnique({
      where: { slug: newSlug },
    })
    let counter = 1
    while (slugExists) {
      newSlug = `${source.slug}-copy-${counter}`
      slugExists = await this.prisma.project.findUnique({
        where: { slug: newSlug },
      })
      counter++
    }

    const visibility = data.visibility || source.visibility
    const modelSettings = data.modelSettings || {
      allowAllModels: source.allowAllModels,
      allowedModelIds: source.allowedModelIds,
      defaultModelId: source.defaultModelId,
    }

    // Create the duplicated project
    const duplicated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: `${source.name} (Copy)`,
          description: source.description,
          slug: newSlug,
          visibility: visibility as ProjectVisibility,
          allowAllModels: modelSettings.allowAllModels ?? true,
          allowedModelIds: modelSettings.allowedModelIds || [],
          defaultModelId: modelSettings.defaultModelId,
          members: {
            create: [
              {
                name: data.creatorMember.name,
                email: data.creatorMember.email,
                role: (data.creatorMember.role as MemberRole) || 'admin',
                status: 'active',
                joinedAt: new Date(),
                avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(data.creatorMember.email)}`,
              },
            ],
          },
        },
        include: {
          members: true,
        },
      })

      // Get source environments to duplicate
      const sourceEnvs = await tx.deploymentEnvironment.findMany({
        where: { projectId: source.id },
        orderBy: { order: 'asc' },
      })

      const envMap = new Map<string, string>() // sourceEnvSlug -> newEnvId

      if (sourceEnvs.length > 0) {
        for (const env of sourceEnvs) {
          const newEnv = await tx.deploymentEnvironment.create({
            data: {
              projectId: created.id,
              name: env.name,
              slug: env.slug,
              color: env.color,
              order: env.order,
              approvalRequired: env.approvalRequired,
            },
          })
          envMap.set(env.slug, newEnv.id)
        }
      } else {
        // Create default environments if source has none
        const defaultEnvs = [
          { slug: 'dev', name: 'Development', color: 'blue', order: 0 },
          { slug: 'staging', name: 'Staging', color: 'amber', order: 1 },
          { slug: 'prod', name: 'Production', color: 'emerald', order: 2 },
        ]
        for (const env of defaultEnvs) {
          const newEnv = await tx.deploymentEnvironment.create({
            data: {
              projectId: created.id,
              slug: env.slug,
              name: env.name,
              color: env.color,
              order: env.order,
            },
          })
          envMap.set(env.slug, newEnv.id)
        }
      }

      const user = await tx.user.findUnique({ where: { email: userEmail } })

      // Copy selected workflows
      for (const workflow of source.workflows) {
        const createdWorkflow = await tx.workflow.create({
          data: {
            projectId: created.id,
            name: workflow.name,
            slug: workflow.slug,
            description: workflow.description,
            nodes: workflow.nodes ? (workflow.nodes as any) : [],
            edges: workflow.edges ? (workflow.edges as any) : [],
            variables: workflow.variables ? (workflow.variables as any) : [],
            status: workflow.status,
          },
        })

        let versionToDeploy: any = null

        // Copy versions if requested
        if (data.copyVersions && 'versions' in workflow && Array.isArray((workflow as any).versions)) {
          for (const version of (workflow as any).versions) {
            const newVersion = await tx.workflowVersion.create({
              data: {
                workflowId: createdWorkflow.id,
                number: version.number,
                label: version.label,
                message: version.message,
                snapshot: version.snapshot ? (version.snapshot as any) : {},
                diff: version.diff ? (version.diff as any) : null,
                createdBy: version.createdBy,
              },
            })
            versionToDeploy = newVersion
          }
        } else {
          // Create a new initial version for the duplicated workflow
          versionToDeploy = await tx.workflowVersion.create({
            data: {
              workflowId: createdWorkflow.id,
              number: 1,
              message: `Duplicated from ${source.name}`,
              snapshot: {
                nodes: createdWorkflow.nodes,
                edges: createdWorkflow.edges,
                variables: createdWorkflow.variables,
              } as any,
              createdBy: user?.id || source.members[0].email, // fallback to some user ID
            },
          })
        }

        // Deploy to new project's environments
        if (versionToDeploy && user) {
          for (const [envSlug, envId] of envMap.entries()) {
            const endpointPath = `/api/v1/workflows/${createdWorkflow.slug}/${envSlug}/run`
            
            const deployment = await tx.deployment.create({
              data: {
                projectId: created.id,
                workflowId: createdWorkflow.id,
                workflowName: createdWorkflow.name,
                environmentId: envId,
                environment: envSlug,
                versionId: versionToDeploy.id,
                versionNumber: versionToDeploy.number,
                status: 'active',
                deployedBy: user.id,
                endpointPath,
              },
            })

            await tx.endpoint.create({
              data: {
                deploymentId: deployment.id,
                workflowId: createdWorkflow.id,
                workflowName: createdWorkflow.name,
                projectSlug: created.slug,
                workflowSlug: createdWorkflow.slug,
                path: endpointPath,
                method: 'POST',
                environment: envSlug,
                versionNumber: versionToDeploy.number,
                versionId: versionToDeploy.id,
                variables: createdWorkflow.variables ? (createdWorkflow.variables as any) : [],
                status: 'active',
              },
            })

            await tx.deploymentLog.create({
              data: {
                projectId: created.id,
                workflowId: createdWorkflow.id,
                workflowName: createdWorkflow.name,
                action: 'deploy',
                environment: envSlug,
                toVersion: versionToDeploy.number,
                performedBy: user.id,
                performedAt: new Date(),
                note: 'Initial deployment upon project duplication',
              },
            })
          }
        }
      }

      return created
    })

    return this.findById(duplicated.id, userEmail)
  }

  async toggleFavorite(_projectId: string, _userEmail: string) {
    // This functionality is currently disabled or not supported by current schema
    // projectFavorite model does not exist in schema.prisma
    return { success: false, message: 'Favorites feature is not available' }
  }
}
