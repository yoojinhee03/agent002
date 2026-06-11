import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSkillDto } from './dto/create-skill.dto'
import { UpdateSkillDto } from './dto/update-skill.dto'
import { CreateSkillFileDto } from './dto/create-skill-file.dto'
import { UpdateSkillFileDto } from './dto/update-skill-file.dto'
import { ImportSkillDto } from './dto/import-skill.dto'

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.skill.findMany({
      where: { userId },
      include: { files: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getOne(id: string, userId: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
      include: { files: true },
    })
    if (!skill) throw new NotFoundException('Skill을 찾을 수 없습니다')
    if (skill.userId !== userId) throw new ForbiddenException('접근 권한이 없습니다')
    return skill
  }

  async create(userId: string, dto: CreateSkillDto) {
    const existing = await this.prisma.skill.findUnique({
      where: { userId_name: { userId, name: dto.name } },
    })
    if (existing) throw new ConflictException('동일한 이름의 Skill이 이미 존재합니다')

    return this.prisma.skill.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description ?? '',
        instructions: dto.instructions ?? '',
        allowedTools: dto.allowedTools ?? [],
        enabled: dto.enabled ?? true,
      },
      include: { files: true },
    })
  }

  async update(id: string, userId: string, dto: UpdateSkillDto) {
    await this.getOne(id, userId)

    if (dto.name !== undefined) {
      const conflict = await this.prisma.skill.findUnique({
        where: { userId_name: { userId, name: dto.name } },
      })
      if (conflict && conflict.id !== id) {
        throw new ConflictException('동일한 이름의 Skill이 이미 존재합니다')
      }
    }

    return this.prisma.skill.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions }),
        ...(dto.allowedTools !== undefined && { allowedTools: dto.allowedTools }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: { files: true },
    })
  }

  async remove(id: string, userId: string) {
    await this.getOne(id, userId)
    await this.prisma.skill.delete({ where: { id } })
    return { success: true }
  }

  async importSkill(userId: string, dto: ImportSkillDto) {
    const name = await this.resolveUniqueName(userId, dto.name)

    const seen = new Set<string>()
    const files = (dto.files ?? []).filter((f) => {
      if (seen.has(f.path)) return false
      seen.add(f.path)
      return true
    })

    return this.prisma.skill.create({
      data: {
        userId,
        name,
        description: dto.description ?? '',
        instructions: dto.instructions ?? '',
        allowedTools: dto.allowedTools ?? [],
        enabled: dto.enabled ?? true,
        files: { create: files.map((f) => ({ path: f.path, content: f.content })) },
      },
      include: { files: true },
    })
  }

  private async resolveUniqueName(userId: string, base: string): Promise<string> {
    const root = base.length > 90 ? base.slice(0, 90) : base
    let candidate = base
    let n = 1
    while (
      await this.prisma.skill.findUnique({
        where: { userId_name: { userId, name: candidate } },
      })
    ) {
      candidate = `${root} (${n})`
      n++
    }
    return candidate
  }

  // ============================================================
  // SkillFile
  // ============================================================

  async addFile(skillId: string, userId: string, dto: CreateSkillFileDto) {
    await this.getOne(skillId, userId)

    const existing = await this.prisma.skillFile.findUnique({
      where: { skillId_path: { skillId, path: dto.path } },
    })
    if (existing) throw new ConflictException('동일한 경로의 파일이 이미 존재합니다')

    return this.prisma.skillFile.create({
      data: {
        skillId,
        path: dto.path,
        content: dto.content,
      },
    })
  }

  async updateFile(skillId: string, fileId: string, userId: string, dto: UpdateSkillFileDto) {
    await this.getOne(skillId, userId)

    const file = await this.prisma.skillFile.findUnique({ where: { id: fileId } })
    if (!file) throw new NotFoundException('파일을 찾을 수 없습니다')
    if (file.skillId !== skillId) throw new ForbiddenException('접근 권한이 없습니다')

    if (dto.path !== undefined && dto.path !== file.path) {
      const conflict = await this.prisma.skillFile.findUnique({
        where: { skillId_path: { skillId, path: dto.path } },
      })
      if (conflict) throw new ConflictException('동일한 경로의 파일이 이미 존재합니다')
    }

    return this.prisma.skillFile.update({
      where: { id: fileId },
      data: {
        ...(dto.path !== undefined && { path: dto.path }),
        ...(dto.content !== undefined && { content: dto.content }),
      },
    })
  }

  async removeFile(skillId: string, fileId: string, userId: string) {
    await this.getOne(skillId, userId)

    const file = await this.prisma.skillFile.findUnique({ where: { id: fileId } })
    if (!file) throw new NotFoundException('파일을 찾을 수 없습니다')
    if (file.skillId !== skillId) throw new ForbiddenException('접근 권한이 없습니다')

    await this.prisma.skillFile.delete({ where: { id: fileId } })
    return { success: true }
  }
}
