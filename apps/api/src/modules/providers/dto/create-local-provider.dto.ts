import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class CreateLocalProviderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  endpoint: string;
}
