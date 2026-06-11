import { Module } from '@nestjs/common'
import { ThreadsService } from './threads.service'
import {
  ThreadsController,
  ThreadDetailController,
  ThreadAttachmentController,
} from './threads.controller'

@Module({
  controllers: [ThreadsController, ThreadDetailController, ThreadAttachmentController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
