import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateCredentialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string

  @ApiPropertyOptional({ description: '값을 교체하면 새로 암호화되어 저장됩니다.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
