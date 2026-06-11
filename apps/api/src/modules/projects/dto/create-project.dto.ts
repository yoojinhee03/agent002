import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

class CreateProjectMemberDto {
  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @IsNotEmpty()
  email: string

  @ApiProperty({ example: 'admin', enum: ['admin', 'editor', 'viewer'] })
  @IsString()
  @IsNotEmpty()
  role: string

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  joinedAt?: Date

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string

  @ApiPropertyOptional()
  @IsOptional()
  invitedAt?: Date

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invitedBy?: string
}

export class CreateProjectDto {
  @ApiProperty({ example: 'New Project' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiPropertyOptional({ example: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ example: 'new-project' })
  @IsString()
  @IsNotEmpty()
  slug: string

  @ApiPropertyOptional({ example: 'private', enum: ['private', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'public'] as const)
  visibility?: string

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  publicDocsEnabled?: boolean

  @ApiPropertyOptional({ type: [CreateProjectMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProjectMemberDto)
  members?: CreateProjectMemberDto[]

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
