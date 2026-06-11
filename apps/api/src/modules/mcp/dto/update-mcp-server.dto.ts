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
import { ApiPropertyOptional } from '@nestjs/swagger'
import type { McpServerConfig, McpTransport } from '@agent-studio/shared'
import { RequiredUserFieldDto } from './create-mcp-server.dto'

export class UpdateMcpServerDto {
  @ApiPropertyOptional({ description: 'MCP 서버 이름' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: '서버 설명' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ enum: ['stdio', 'sse', 'streamable_http'], description: '전송 방식' })
  @IsOptional()
  @IsEnum(['stdio', 'sse', 'streamable_http'])
  transport?: McpTransport

  @ApiPropertyOptional({ description: '전송 방식별 설정 (partial update)' })
  @IsOptional()
  @IsObject()
  config?: McpServerConfig

  @ApiPropertyOptional({
    enum: ['shared', 'per_user'],
    description: '자격증명 모드',
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
    description: '에이전트에 노출할 도구 이름 목록. 빈 배열이면 전체 노출',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exposedTools?: string[]
}

export class ToggleToolVisibilityDto {
  @ApiPropertyOptional({ description: 'true=노출, false=숨김' })
  @IsBoolean()
  exposed: boolean
}
