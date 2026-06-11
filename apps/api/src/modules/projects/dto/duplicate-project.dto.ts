import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

class CreatorMemberDto {
  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  name: string

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string

  @ApiProperty({ example: 'admin', enum: ['admin', 'editor', 'viewer'] })
  @IsString()
  role: string
}

class ModelSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  allowAllModels?: boolean

  @ApiPropertyOptional({ example: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModelIds?: string[]

  @ApiPropertyOptional({ example: 'gpt-4o' })
  @IsOptional()
  @IsString()
  defaultModelId?: string
}

export class DuplicateProjectDto {
  @ApiProperty({ type: CreatorMemberDto })
  @ValidateNested()
  @Type(() => CreatorMemberDto)
  creatorMember: CreatorMemberDto

  @ApiProperty({ example: ['prompt-1', 'prompt-2'] })
  @IsArray()
  @IsString({ each: true })
  selectedPromptIds: string[]

  @ApiProperty({ example: true })
  @IsBoolean()
  copyVersions: boolean

  @ApiPropertyOptional({ example: 'private', enum: ['private', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'public'] as const)
  visibility?: string

  @ApiPropertyOptional({ type: ModelSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ModelSettingsDto)
  modelSettings?: ModelSettingsDto
}
