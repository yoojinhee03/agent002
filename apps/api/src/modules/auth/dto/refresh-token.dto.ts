import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbG...', description: 'Refresh 토큰' })
  @IsString()
  refreshToken: string
}
