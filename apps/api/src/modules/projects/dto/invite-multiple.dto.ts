import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

class InviteUserItem {
  @ApiProperty({ example: 'User Name' })
  @IsString()
  name: string

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string
}

export class InviteMultipleDto {
  @ApiProperty({ type: [InviteUserItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteUserItem)
  users: InviteUserItem[]

  @ApiProperty({ example: 'editor', enum: ['admin', 'editor', 'viewer'] })
  @IsEnum(['admin', 'editor', 'viewer'] as const)
  role: string

  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  invitedBy: string

  @ApiPropertyOptional({ example: 'Welcome to the project!' })
  @IsOptional()
  @IsString()
  message?: string
}
