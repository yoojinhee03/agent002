import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator'

export class AiGenerateDto {
  @ApiProperty({ description: '생성할 대상 (description, inputSchema, outputSchema, bodyTemplate)' })
  @IsEnum(['description', 'inputSchema', 'outputSchema', 'bodyTemplate', 'schemaFromTemplate'])
  target: 'description' | 'inputSchema' | 'outputSchema' | 'bodyTemplate' | 'schemaFromTemplate'

  @ApiProperty({ description: '도구 이름' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiProperty({ description: '도구 타입' })
  @IsOptional()
  @IsString()
  type?: string

  @ApiProperty({ description: '현재 설명' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ description: '현재 입력 스키마' })
  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>

  @ApiProperty({ description: '현재 출력 스키마' })
  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>

  @ApiProperty({ description: '현재 바디 템플릿' })
  @IsOptional()
  @IsString()
  bodyTemplate?: string

  @ApiProperty({ description: '추가 힌트/요구사항' })
  @IsOptional()
  @IsString()
  prompt?: string
}
