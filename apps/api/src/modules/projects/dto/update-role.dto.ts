import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsEnum } from 'class-validator'

export class UpdateRoleDto {
  @ApiProperty({ example: 'editor', enum: ['admin', 'editor', 'viewer'] })
  @IsEnum(['admin', 'editor', 'viewer'] as const)
  role: string

  @ApiPropertyOptional({ example: 'Hong Gildong' })
  @IsOptional()
  @IsString()
  changedBy?: string
}
