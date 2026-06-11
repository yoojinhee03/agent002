import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class UpdateAgentDto {
  @ApiProperty({ description: '봇이 사용할 에이전트 ID' })
  @IsString()
  @MinLength(1)
  agentId: string
}
