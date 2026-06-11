import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean } from 'class-validator'

export class EnableInstallationDto {
  @ApiProperty({ description: '활성화 여부' })
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  enabled: boolean
}
