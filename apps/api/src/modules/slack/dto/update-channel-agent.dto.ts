import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsOptional } from 'class-validator'
import { SlackRoutingMode } from '@prisma/client'

export class UpdateChannelAgentDto {
  @ApiPropertyOptional({ enum: SlackRoutingMode, description: '라우팅 모드 변경' })
  @IsOptional()
  @IsEnum(SlackRoutingMode)
  mode?: SlackRoutingMode

  @ApiPropertyOptional({ description: '활성화 여부 토글' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
