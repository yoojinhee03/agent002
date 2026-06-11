import { Module } from '@nestjs/common'
import { HitlService } from './hitl.service'
import { HitlController } from './hitl.controller'

@Module({
  controllers: [HitlController],
  providers: [HitlService],
  exports: [HitlService],
})
export class HitlModule {}
