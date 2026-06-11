import { ApiProperty } from '@nestjs/swagger'
import { IsEmail } from 'class-validator'

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: '비밀번호 재설정 대상 이메일' })
  @IsEmail()
  email: string
}
