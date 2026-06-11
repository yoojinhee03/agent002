import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength, IsIn } from 'class-validator'

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Hong Gildong' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  avatarUrl?: string
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'newPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string
}

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'currentPassword' })
  @IsString()
  currentPassword: string

  @ApiProperty({ example: 'newPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ['admin', 'user'] })
  @IsIn(['admin', 'user'])
  role: 'admin' | 'user'
}
