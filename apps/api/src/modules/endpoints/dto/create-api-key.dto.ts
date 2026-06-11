import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator'

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production API Key' })
  @IsString()
  name: string

  @ApiProperty({ example: 'production' })
  @IsString()
  environment: string

  @ApiPropertyOptional({ type: [String], example: ['endpoint-id-1'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  endpointIds?: string[]

  @ApiPropertyOptional({ type: [String], example: ['read', 'execute'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[]

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string
}
