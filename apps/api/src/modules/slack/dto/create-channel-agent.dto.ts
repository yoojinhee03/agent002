import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { SlackRoutingMode } from '@prisma/client'

export class CreateChannelAgentDto {
  @ApiProperty({ description: 'Slack 채널 ID (C... / D... / G...)', example: 'C012AB3CD' })
  @IsString()
  @MinLength(1)
  channelId: string

  @ApiPropertyOptional({ description: 'Slack 채널 이름 (표시용 캐시)', example: 'general' })
  @IsOptional()
  @IsString()
  channelName?: string

  @ApiProperty({ description: '매핑할 Agent ID' })
  @IsString()
  @MinLength(1)
  agentId: string

  @ApiProperty({ enum: SlackRoutingMode, description: '라우팅 모드' })
  @IsEnum(SlackRoutingMode)
  mode: SlackRoutingMode
}
