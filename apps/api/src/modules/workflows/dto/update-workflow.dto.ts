import { IsString, IsOptional, IsArray } from 'class-validator'

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  nodes?: unknown[]

  @IsOptional()
  @IsArray()
  edges?: unknown[]

  @IsOptional()
  @IsArray()
  variables?: unknown[]
}
