import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { InviteUserDto, RegisterUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  role: true,
  avatarUrl: true,
  createdAt: true,
  activatedAt: true,
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({ select: USER_SELECT })
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }
    return user
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    })
  }

  async search(query: string) {
    return this.prisma.user.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: USER_SELECT,
    })
  }

  async invite(data: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    })
    if (existing) {
      throw new ConflictException(`User with email "${data.email}" already exists`)
    }

    const avatarSeed = encodeURIComponent(data.email)
    const avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${avatarSeed}`

    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: '',
        status: 'pending',
        avatarUrl,
      },
      select: USER_SELECT,
    })
  }

  async registerDirect(data: RegisterUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    })
    if (existing) {
      throw new ConflictException(`User with email "${data.email}" already exists`)
    }

    const userCount = await this.prisma.user.count()
    const role = userCount === 0 ? 'admin' : 'user'

    const hashedPassword = await bcrypt.hash(data.password, 10)
    const avatarSeed = encodeURIComponent(data.email)
    const avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${avatarSeed}`

    // 사용자 + 본인 Workspace Project + ProjectMember(owner) 를 한 트랜잭션으로 생성.
    // 신규 사용자가 client/admin 어느 쪽으로 진입하든 곧장 본인 Project 데이터를 볼 수 있도록.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          status: 'active',
          role: role as 'admin' | 'user',
          avatarUrl,
          activatedAt: new Date(),
        },
        select: USER_SELECT,
      })

      const slugTag = user.id.slice(0, 8)
      const project = await tx.project.create({
        data: {
          name: `${user.name} Workspace`,
          slug: `workspace-${slugTag}`,
          description: '자동 생성된 기본 프로젝트',
          visibility: 'private',
          members: {
            create: {
              email: user.email,
              name: user.name,
              role: 'admin',
              status: 'active',
              joinedAt: new Date(),
            },
          },
        },
      })

      // projects.service.ts::create 와 동일한 기본 환경 시드.
      // 환경이 없으면 agent_deployments 가 NOT NULL 제약으로 INSERT 자체가 막혀 배포 불가.
      await tx.deploymentEnvironment.createMany({
        data: [
          { projectId: project.id, slug: 'dev', name: 'Development', color: 'blue', order: 0 },
          { projectId: project.id, slug: 'staging', name: 'Staging', color: 'amber', order: 1 },
          { projectId: project.id, slug: 'prod', name: 'Production', color: 'emerald', order: 2 },
        ],
      })

      return user
    })
  }

  async activate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }
    if (user.status !== 'pending') {
      throw new BadRequestException('User is not in pending status')
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        status: 'active',
        activatedAt: new Date(),
      },
    })
    return { success: true }
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }

    await this.prisma.user.update({
      where: { id },
      data,
    })
    return { success: true }
  }

  async changePassword(id: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    })
    return { success: true }
  }

  // 본인 비밀번호 변경 — 현재 비밀번호 검증 필수.
  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) {
      throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.')
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })
    return { success: true }
  }

  async updateRole(id: string, role: 'admin' | 'user', requesterId: string) {
    if (id === requesterId) {
      throw new ForbiddenException('Cannot change your own role')
    }

    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }

    if (role === 'user') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'admin' },
      })
      if (adminCount <= 1 && user.role === 'admin') {
        throw new BadRequestException('Cannot demote the last system admin')
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { role },
    })
    return { success: true }
  }

  async resendInvite(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`)
    }
    if (user.status !== 'pending') {
      throw new BadRequestException('User is not in pending status')
    }

    // TODO: integrate email service to actually resend invite
    return { success: true }
  }
}
