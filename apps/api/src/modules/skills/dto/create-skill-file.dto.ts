import { IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateSkillFileDto {
  @ApiProperty({ description: '파일 경로 (예: src/utils/helper.py)', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  path: string

  @ApiProperty({ description: '파일 내용' })
  @IsString()
  content: string
}
