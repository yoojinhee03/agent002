import { IsString, IsOptional, IsBoolean, IsArray, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSkillDto {
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
}
