import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { MembersService } from './members.service'
import { ActivityLogService } from './activity-log.service'
import { ProjectsController } from './projects.controller'
import { MembersController } from './members.controller'
import { PrismaService } from '../../prisma/prisma.service'

@Module({
  providers: [
    ProjectsService,
    MembersService,
    ActivityLogService,
    PrismaService,
  ],
  controllers: [ProjectsController, MembersController],
  exports: [ProjectsService, MembersService, ActivityLogService],
})
export class ProjectsModule {}
