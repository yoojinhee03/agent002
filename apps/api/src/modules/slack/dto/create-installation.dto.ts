import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class CreateInstallationDto {
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
}
