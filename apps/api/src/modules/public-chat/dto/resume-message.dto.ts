import { ApiProperty } from '@nestjs/swagger'
import { IsArray } from 'class-validator'

export class ResumeMessageDto {
  @ApiProperty({
    description: 'deepagents HITL 응답 배열. [{type:"approve"} | {type:"reject"} | {type:"edit", edited_action:{...}}]',
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  decisions: Array<Record<string, unknown>>
}
