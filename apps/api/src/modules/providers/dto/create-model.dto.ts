import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  contextWindow: number;

  @IsNumber()
  inputPrice: number;

  @IsNumber()
  outputPrice: number;

  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
