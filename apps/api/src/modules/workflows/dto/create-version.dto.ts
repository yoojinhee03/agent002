import { IsString, IsOptional, IsObject } from 'class-validator'

export class CreateVersionDto {
  @IsString()
  message: string

  @IsOptional()
  @IsString()
  label?: string

  @IsObject()
  snapshot: {
    nodes: unknown[]
    edges: unknown[]
    variables: unknown[]
  }

  @IsString()
  createdBy: string
}
