import { Module } from '@nestjs/common'
import { MeCredentialsModule } from '../me-credentials/me-credentials.module'
import { MeToolsController } from './me-tools.controller'
import { MeToolsService } from './me-tools.service'

@Module({
  imports: [MeCredentialsModule],
  controllers: [MeToolsController],
  providers: [MeToolsService],
  exports: [MeToolsService],
})
export class MeToolsModule {}
