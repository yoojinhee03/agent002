import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator'

export class AddProviderDto {
  @ApiProperty({ description: 'Provider id (carrier 카탈로그 row)', example: 'prov-uuid' })
  @IsString()
  providerId: string

  @ApiProperty({ description: 'API key 평문' })
  @IsString()
  @MinLength(1)
  value: string

  @ApiPropertyOptional({ description: '같은 provider 에 여러 키 등록 시 라벨' })
  @IsOptional()
  @IsString()
  label?: string

  @ApiPropertyOptional({ description: 'organization id 등 부가 정보' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
