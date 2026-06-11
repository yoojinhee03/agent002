import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class UpsertInstallationDto {
  @ApiProperty({ description: 'Slack Bot User OAuth Token (xoxb-...)', example: 'xoxb-...' })
  @IsString()
  @MinLength(1)
  botToken: string

  @ApiProperty({
    description: 'Slack App-Level Token for Socket Mode (xapp-...)',
    example: 'xapp-...',
  })
  @IsString()
  @MinLength(1)
  appToken: string

  @ApiPropertyOptional({ description: '설치 활성화 여부', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
