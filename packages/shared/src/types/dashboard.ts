import type { Agent } from "./agent"
import type { Workflow } from "./workflow"
import type { WorkflowRun } from "./agent-run"
import type { Deployment, DeploymentEnvironment, DeploymentLog } from "./deployment"
import type { Endpoint, ApiKey } from "./endpoint"
import type { MetricSummary, DailyMetric } from "./monitoring"
import type { Member, ProjectActivityLog } from "./project"

export interface DashboardOverview {
  workflows: Workflow[]
  agents: Agent[]
  deployments: Deployment[]
  environments: DeploymentEnvironment[]
  endpoints: Endpoint[]
  apiKeys: ApiKey[]
  members: Member[]
  metricSummary: MetricSummary
  dailyMetrics: DailyMetric[]
  recentRuns: WorkflowRun[]
  deploymentLogs: DeploymentLog[]
  activityLogs: ProjectActivityLog[]
}
