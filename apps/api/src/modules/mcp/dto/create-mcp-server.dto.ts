import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { McpTransport, McpServerConfig } from '@agent-studio/shared'

export class RequiredUserFieldDto {
  @ApiProperty({ description: 'env 키 이름 (예: TAVILY_API_KEY)' })
  @IsString()
  key: string

  @ApiProperty({ description: '사용자에게 표시할 라벨' })
  @IsString()
  label: string

  @ApiPropertyOptional({ description: '비밀 값 여부 (password 타입으로 렌더링)', default: false })
  @IsOptional()
  @IsBoolean()
  secret?: boolean

  @ApiPropertyOptional({ description: '입력 placeholder' })
  @IsOptional()
  @IsString()
  placeholder?: string

  @ApiPropertyOptional({ description: '필수 입력 여부', default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean
}

export class CreateMcpServerDto {
  @ApiProperty({ description: 'MCP 서버 이름' })
  @IsString()
  name: string

  @ApiPropertyOptional({ description: '서버 설명' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ enum: ['stdio', 'sse', 'streamable_http'], description: '전송 방식' })
  @IsEnum(['stdio', 'sse', 'streamable_http'])
  transport: McpTransport

  @ApiProperty({ description: '전송 방식별 설정 (command/args/env 또는 url/headers)' })
  @IsObject()
  config: McpServerConfig

  @ApiPropertyOptional({
    enum: ['shared', 'per_user'],
    description: '자격증명 모드. shared=빌더 공용, per_user=사용자별 개인 자격증명 강제',
    default: 'shared',
  })
  @IsOptional()
  @IsEnum(['shared', 'per_user'])
  credentialMode?: 'shared' | 'per_user'

  @ApiPropertyOptional({
    type: [RequiredUserFieldDto],
    description: 'per_user 모드일 때 사용자에게 입력받을 필드 메타 목록',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequiredUserFieldDto)
  requiredUserFields?: RequiredUserFieldDto[]

  @ApiPropertyOptional({
    type: [String],
    description: '에이전트에 노출할 도구 이름 목록. 빈 배열이면 전체 노출(하위 호환)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exposedTools?: string[]
}
