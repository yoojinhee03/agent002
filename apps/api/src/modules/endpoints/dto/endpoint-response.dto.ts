import { ApiProperty } from '@nestjs/swagger'

export class EndpointPromptDto {
  @ApiProperty({ example: 'uuid' })
  id: string

  @ApiProperty({ example: 'Customer Support' })
  name: string

  @ApiProperty({ example: 'customer-support' })
  slug: string

  @ApiProperty({ description: '프롬프트 설명', example: 'Customer support prompt for handling inquiries' })
  description: string
}

export class EndpointResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string

  @ApiProperty({ example: 'customer-support' })
  promptSlug: string

  @ApiProperty({ example: 'Customer Support' })
  promptName: string

  @ApiProperty({ description: '프롬프트 설명', example: 'Customer support prompt for handling inquiries' })
  description: string

  @ApiProperty({ example: '/api/v1/prompts/customer-support/production/run' })
  path: string

  @ApiProperty({ example: 'POST' })
  method: string

  @ApiProperty({ example: 'production' })
  environment: string

  @ApiProperty({ example: 3 })
  versionNumber: number

  @ApiProperty({ example: 'gpt-4o' })
  modelId: string

  @ApiProperty({ enum: ['active', 'paused', 'inactive'], example: 'active' })
  status: string

  @ApiProperty({ type: () => EndpointPromptDto })
  prompt: EndpointPromptDto
}
