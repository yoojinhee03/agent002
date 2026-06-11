import { Module } from '@nestjs/common';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService, PrismaService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
