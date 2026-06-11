import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsString, MinLength } from 'class-validator'

export class InternalVisionAnalyzeDto {
  @ApiProperty({ description: 'Base64 encoded image (standard base64, no data: prefix)' })
  @IsString()
  @MinLength(1)
  image_base64: string

  @ApiProperty({ description: 'Image mime type', example: 'image/jpeg' })
  @IsString()
  @MinLength(1)
  mime_type: string

  @ApiProperty({ description: 'Extraction prompt' })
  @IsString()
  @MinLength(1)
  prompt: string

  @ApiProperty({ description: 'Model id override (optional)', required: false })
  @IsString()
  @IsIn(['gpt-4o-mini', 'gpt-4o'])
  model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini'
}
