import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator'

export class IssueDeploymentApiKeyDto {
  @ApiProperty({ example: 'Production widget key' })
  @IsString()
  name: string

  @ApiPropertyOptional({
    description: 'scope 배열. 기본값 ["chat:invoke","chat:resume","chat:read"]',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[]

  @ApiPropertyOptional({ description: 'ISO datetime', example: '2026-05-08T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ description: 'ISO datetime', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string
}
