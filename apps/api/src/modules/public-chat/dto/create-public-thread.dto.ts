import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString } from 'class-validator'

export class CreatePublicThreadDto {
  @ApiPropertyOptional({ example: '문의: 가격 정책' })
  @IsOptional()
  @IsString()
  title?: string

  @ApiPropertyOptional({
    description: '외부 client 가 thread 에 부착할 자유로운 JSON metadata',
    example: { userRef: 'u_42' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
