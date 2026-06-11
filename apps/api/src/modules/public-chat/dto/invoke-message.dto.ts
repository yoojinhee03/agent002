import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class InvokeMessageDto {
  @ApiProperty({ description: '사용자 메시지', example: '제품 환불 정책이 어떻게 되나요?' })
  @IsString()
  message: string
}
