import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator'

export type ToolType = 'http' | 'code' | 'search' | 'custom'

export class CreateToolDto {
  @IsString()
  name: string

  @IsOptional()
  @IsString()
  slug?: string

  @IsOptional()
  @IsString()
  groupId?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsEnum(['http', 'code', 'search', 'custom'])
  type: ToolType

  @IsObject()
  config: Record<string, unknown>

  @IsObject()
  inputSchema: Record<string, unknown>

  @IsObject()
  outputSchema: Record<string, unknown>

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>
}
