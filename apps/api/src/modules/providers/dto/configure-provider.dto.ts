import { IsString, IsNotEmpty } from 'class-validator';

export class ConfigureProviderDto {
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}
