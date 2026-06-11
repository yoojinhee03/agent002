import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class NaverWorksReplyDto {
  @ApiProperty({ description: 'NAVER WORKS Bot ID' })
  @IsString()
  @MinLength(1)
  botId: string

  @ApiProperty({ description: '수신자 NAVER WORKS userId' })
  @IsString()
  @MinLength(1)
  naverUserId: string

  @ApiProperty({ description: '응답 텍스트 (긴 텍스트는 분할 송신)' })
  @IsString()
  text: string
}
