import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class CreateAgentDeploymentDto {
  @ApiProperty({ description: '배포 대상 환경 ID', example: 'env-uuid' })
  @IsString()
  environmentId: string

  @ApiPropertyOptional({ description: 'release note', example: 'v1 first deploy' })
  @IsOptional()
  @IsString()
  description?: string
}
