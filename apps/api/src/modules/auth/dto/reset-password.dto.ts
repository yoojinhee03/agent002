import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: '사용자 이메일' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'reset-token', description: '비밀번호 재설정 토큰' })
  @IsString()
  token: string

  @ApiProperty({ example: 'newPassword123', description: '새 비밀번호 (최소 6자)' })
  @IsString()
  @MinLength(6)
  newPassword: string
}
