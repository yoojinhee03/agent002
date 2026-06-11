import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderEnvironmentsDto {
  @ApiProperty({
    description: 'Array of environment IDs in the desired order',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  environmentIds: string[];
}
