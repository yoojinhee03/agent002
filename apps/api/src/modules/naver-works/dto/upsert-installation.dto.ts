import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class UpsertNaverWorksInstallationDto {
  @ApiProperty({ description: 'AgentStudio 에이전트 ID', example: 'agent-uuid' })
  @IsString()
  @MinLength(1)
  agentId: string

  @ApiProperty({ description: 'NAVER WORKS Bot ID' })
  @IsString()
  @MinLength(1)
  botId: string

  @ApiPropertyOptional({ description: 'UI 표시용 봇 이름' })
  @IsOptional()
  @IsString()
  botName?: string

  @ApiProperty({ description: 'Developer Console Client ID' })
  @IsString()
  @MinLength(1)
  clientId: string

  @ApiProperty({ description: 'Developer Console Client Secret (저장 시 암호화)' })
  @IsString()
  @MinLength(1)
  clientSecret: string

  @ApiProperty({
    description: 'Service Account (JWT sub) — xxx@example.serviceaccount',
  })
  @IsString()
  @MinLength(1)
  serviceAccount: string

  @ApiProperty({
    description: 'Service Account Private Key (PEM 본문, 저장 시 암호화)',
    example: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  })
  @IsString()
  @MinLength(1)
  privateKey: string

  @ApiProperty({ description: 'Bot Secret — callback HMAC 검증용 (저장 시 암호화)' })
  @IsString()
  @MinLength(1)
  botSecret: string

  @ApiPropertyOptional({ description: 'OAuth scope', default: 'bot bot.message' })
  @IsOptional()
  @IsString()
  scope?: string

  @ApiPropertyOptional({ description: '활성화 여부', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
