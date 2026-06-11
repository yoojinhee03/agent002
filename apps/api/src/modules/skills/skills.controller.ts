import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SkillsService } from './skills.service'
import { CreateSkillDto } from './dto/create-skill.dto'
import { UpdateSkillDto } from './dto/update-skill.dto'
import { CreateSkillFileDto } from './dto/create-skill-file.dto'
import { UpdateSkillFileDto } from './dto/update-skill-file.dto'
import { ImportSkillDto } from './dto/import-skill.dto'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('Skills')
@ApiBearerAuth()
@Controller('skills')
export class SkillsController {
  constructor(private readonly service: SkillsService) {}

  @ApiOperation({ summary: '현재 사용자 Skills 목록 조회 (files 포함)' })
  @ApiResponse({ status: 200, description: 'Skills 목록 반환' })
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.service.list(userId)
  }

  @ApiOperation({ summary: 'Skill 생성' })
  @ApiResponse({ status: 201, description: '생성된 Skill 반환' })
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSkillDto,
  ) {
    return this.service.create(userId, dto)
  }

  @ApiOperation({ summary: 'Skill 가져오기 (JSON import, 이름 충돌 시 자동 리네임)' })
  @ApiResponse({ status: 201, description: '생성된 Skill 반환' })
  @Post('import')
  importSkill(
    @CurrentUser('id') userId: string,
    @Body() dto: ImportSkillDto,
  ) {
    return this.service.importSkill(userId, dto)
  }

  @ApiOperation({ summary: 'Skill 단건 조회 (files 포함)' })
  @ApiResponse({ status: 200, description: 'Skill 반환' })
  @ApiResponse({ status: 404, description: 'Skill 없음' })
  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getOne(id, userId)
  }

  @ApiOperation({ summary: 'Skill 수정' })
  @ApiResponse({ status: 200, description: '수정된 Skill 반환' })
  @ApiResponse({ status: 404, description: 'Skill 없음' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.service.update(id, userId, dto)
  }

  @ApiOperation({ summary: 'Skill 삭제' })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: 'Skill 없음' })
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.remove(id, userId)
  }

  // ============================================================
  // SkillFile
  // ============================================================

  @ApiOperation({ summary: 'Skill에 파일 추가' })
  @ApiResponse({ status: 201, description: '생성된 SkillFile 반환' })
  @Post(':id/files')
  addFile(
    @Param('id') skillId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSkillFileDto,
  ) {
    return this.service.addFile(skillId, userId, dto)
  }

  @ApiOperation({ summary: 'Skill 파일 수정' })
  @ApiResponse({ status: 200, description: '수정된 SkillFile 반환' })
  @ApiResponse({ status: 404, description: '파일 없음' })
  @Patch(':id/files/:fileId')
  updateFile(
    @Param('id') skillId: string,
    @Param('fileId') fileId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSkillFileDto,
  ) {
    return this.service.updateFile(skillId, fileId, userId, dto)
  }

  @ApiOperation({ summary: 'Skill 파일 삭제' })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: '파일 없음' })
  @Delete(':id/files/:fileId')
  removeFile(
    @Param('id') skillId: string,
    @Param('fileId') fileId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.removeFile(skillId, fileId, userId)
  }
}
