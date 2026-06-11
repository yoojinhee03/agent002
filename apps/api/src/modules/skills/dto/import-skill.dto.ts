import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class ImportSkillFileItem {
  @ApiProperty({ description: '파일 경로 (예: src/utils/helper.py)', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  path: string

  @ApiProperty({ description: '파일 내용' })
  @IsString()
  content: string
}

export class ImportSkillDto {
  @ApiProperty({ description: 'Skill 이름', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string

  @ApiPropertyOptional({ description: 'Skill 설명', maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string

  @ApiPropertyOptional({ description: 'Skill 실행 지침' })
  @IsOptional()
  @IsString()
  instructions?: string

  @ApiPropertyOptional({ description: '허용된 도구 목록', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[]

  @ApiPropertyOptional({ description: '활성화 여부', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ description: '포함 파일 목록', type: [ImportSkillFileItem] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportSkillFileItem)
  files?: ImportSkillFileItem[]
}
