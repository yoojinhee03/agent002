import { Module } from '@nestjs/common'
import { PublicChatController } from './public-chat.controller'
import { PublicChatService } from './public-chat.service'

@Module({
  controllers: [PublicChatController],
  providers: [PublicChatService],
  exports: [PublicChatService],
})
export class PublicChatModule {}
