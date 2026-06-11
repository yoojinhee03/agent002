import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator'

export class InviteMemberDto {
  @ApiProperty({ example: 'New Member' })
  @IsString()
  name: string

  @ApiProperty({ example: 'new@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'editor', enum: ['admin', 'editor', 'viewer'] })
  @IsEnum(['admin', 'editor', 'viewer'] as const)
  role: string

  @ApiPropertyOptional({ example: 'Welcome to the project!' })
  @IsOptional()
  @IsString()
  message?: string

  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  invitedBy: string
}
