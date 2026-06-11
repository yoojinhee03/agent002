import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNumber, IsOptional } from 'class-validator'

export class CreateDeploymentDto {
  @ApiProperty({ example: 'workflow-id-123' })
  @IsString()
  workflowId: string

  @ApiProperty({ example: 'My Workflow' })
  @IsString()
  workflowName: string

  @ApiProperty({ example: 'env-id-456' })
  @IsString()
  environmentId: string

  @ApiProperty({ example: 'production' })
  @IsString()
  environment: string

  @ApiProperty({ example: 'version-id-789' })
  @IsString()
  versionId: string

  @ApiProperty({ example: 3 })
  @IsNumber()
  versionNumber: number

  @ApiPropertyOptional({ description: 'Version snapshot data' })
  @IsOptional()
  snapshot: any

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  deployedBy: string
}
