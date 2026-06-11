import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { ProvidersModule } from './modules/providers/providers.module'
import { EnvironmentsModule } from './modules/environments/environments.module'
import { DeploymentsModule } from './modules/deployments/deployments.module'
import { EndpointsModule } from './modules/endpoints/endpoints.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { UsageModule } from './modules/usage/usage.module'
import { MonitoringModule } from './modules/monitoring/monitoring.module'
import { WorkflowsModule } from './modules/workflows/workflows.module'
import { ToolsModule } from './modules/tools/tools.module'
import { RunsModule } from './modules/runs/runs.module'
// AgentStudio v2: Agentic AI
import { AgentsModule } from './modules/agents/agents.module'
import { TeamsModule } from './modules/teams/teams.module'
import { ThreadsModule } from './modules/threads/threads.module'
import { HitlModule } from './modules/hitl/hitl.module'
import { McpModule } from './modules/mcp/mcp.module'
import { SkillsModule } from './modules/skills/skills.module'
import { CardsModule } from './modules/cards/cards.module'
import { DailyMetricsModule } from './modules/daily-metrics/daily-metrics.module'
import { AgentDeploymentsModule } from './modules/agent-deployments/agent-deployments.module'
import { PublicChatModule } from './modules/public-chat/public-chat.module'
import { ClientAgentsModule } from './modules/client-agents/client-agents.module'
import { MeCredentialsModule } from './modules/me-credentials/me-credentials.module'
import { MeProvidersModule } from './modules/me-providers/me-providers.module'
import { MeToolsModule } from './modules/me-tools/me-tools.module'
import { MeMcpModule } from './modules/me-mcp/me-mcp.module'
import { AgentAssistantModule } from './modules/agent-assistant/agent-assistant.module'
import { SkillAssistantModule } from './modules/skill-assistant/skill-assistant.module'
import { SlackModule } from './modules/slack/slack.module'
import { NaverWorksModule } from './modules/naver-works/naver-works.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { ApiKeyGuard } from './modules/auth/guards/api-key.guard'
import { RolesGuard } from './modules/auth/guards/roles.guard'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ProvidersModule,
    EnvironmentsModule,
    DeploymentsModule,
    EndpointsModule,
    DashboardModule,
    UsageModule,
    MonitoringModule,
    // AgentStudio v1: Workflow
    WorkflowsModule,
    ToolsModule,
    RunsModule,
    // AgentStudio v2: Agentic AI
    AgentsModule,
    TeamsModule,
    ThreadsModule,
    HitlModule,
    // Track J: MCP Server
    McpModule,
    // Skills
    SkillsModule,
    // Card Definitions — UI 정의 동적 카드 (Phase 3)
    CardsModule,
    // Daily metrics aggregation cron
    DailyMetricsModule,
    // Phase 9: Agent 배포 + 외부 채팅 API
    AgentDeploymentsModule,
    PublicChatModule,
    // Phase 10: Client UI (배포 agent 디스커버리 + 사용자 자격증명)
    ClientAgentsModule,
    MeCredentialsModule,
    MeProvidersModule,
    MeToolsModule,
    MeMcpModule,
    // Agent Assistant — 시나리오 → main+sub agent 자동 설계 메타 에이전트 프록시
    AgentAssistantModule,
    // Skill Assistant — 스킬 편집 보조 채팅 프록시
    SkillAssistantModule,
    // Slack 통합 — Socket Mode 봇
    SlackModule,
    // NAVER WORKS 통합 — Bot API (callback + 1:1 DM)
    NaverWorksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
