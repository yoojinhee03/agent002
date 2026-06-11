import { Module } from '@nestjs/common'
import { MeMcpController } from './me-mcp.controller'
import { MeMcpService } from './me-mcp.service'

@Module({
  controllers: [MeMcpController],
  providers: [MeMcpService],
  exports: [MeMcpService],
})
export class MeMcpModule {}
