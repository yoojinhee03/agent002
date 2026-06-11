import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateCredentialDto {
  @ApiProperty({ enum: ['provider', 'tool', 'mcp'] })
  @IsEnum(['provider', 'tool', 'mcp'])
  kind: 'provider' | 'tool' | 'mcp'

  @ApiProperty({ description: 'provider slug / tool slug / mcp id', example: 'openai' })
  @IsString()
  targetId: string

  @ApiPropertyOptional({ description: '같은 (kind, targetId) 에 여러 자격증명 등록 시 구분 라벨' })
  @IsOptional()
  @IsString()
  label?: string

  @ApiProperty({ description: '평문 자격증명. 응답 후에는 다시 조회 불가.' })
  @IsString()
  @MinLength(1)
  value: string

  @ApiPropertyOptional({ description: 'scope/account 등 부가 정보' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
