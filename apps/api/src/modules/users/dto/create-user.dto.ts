import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'

export class InviteUserDto {
  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  name: string

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string
}

export class RegisterUserDto {
  @ApiProperty({ example: 'Hong Gildong' })
  @IsString()
  name: string

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string
}
