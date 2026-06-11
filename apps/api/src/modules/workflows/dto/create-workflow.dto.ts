import { IsString, IsOptional, IsArray } from 'class-validator'

export class CreateWorkflowDto {
  @IsString()
  name: string

  @IsString()
  slug: string

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
