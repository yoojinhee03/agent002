import { IsIn, IsObject, IsOptional, IsString } from 'class-validator'

export class TestToolDto {
  @IsOptional()
  @IsString()
  @IsIn(['http', 'code'])
  type?: string

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>
}
