import { Rocket, UserPlus, UserMinus, ArrowUpDown, RotateCcw, Pause, Play, XCircle } from "lucide-react"
import type { DeploymentLog } from "@/types/deployment"
import type { ProjectActivityLog } from "@/types/project"

interface ActivityTimelineProps {
  deploymentLogs: DeploymentLog[]
  activityLogs: ProjectActivityLog[]
  maxItems?: number
}

interface TimelineEvent {
  id: string
  icon: React.ElementType
  iconColor: string
  description: string
  timestamp: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

const DEPLOY_ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  deploy: { icon: Rocket, color: "text-blue-400", label: "배포" },
  promote: { icon: ArrowUpDown, color: "text-emerald-400", label: "프로모트" },
  rollback: { icon: RotateCcw, color: "text-amber-400", label: "롤백" },
  pause: { icon: Pause, color: "text-yellow-400", label: "일시중지" },
  resume: { icon: Play, color: "text-emerald-400", label: "재개" },
  undeploy: { icon: XCircle, color: "text-red-400", label: "배포 해제" },
}

const ACTIVITY_ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  invited: { icon: UserPlus, color: "text-blue-400", label: "초대" },
  accepted: { icon: UserPlus, color: "text-emerald-400", label: "수락" },
  declined: { icon: UserMinus, color: "text-red-400", label: "거절" },
  removed: { icon: UserMinus, color: "text-red-400", label: "제거" },
  role_changed: { icon: ArrowUpDown, color: "text-purple-400", label: "역할 변경" },
  expired: { icon: XCircle, color: "text-zinc-400", label: "만료" },
  cancelled: { icon: XCircle, color: "text-zinc-400", label: "취소" },
  resent: { icon: UserPlus, color: "text-blue-400", label: "재초대" },
}

export function ActivityTimeline({ deploymentLogs, activityLogs, maxItems = 10 }: ActivityTimelineProps) {
  const events: TimelineEvent[] = []

  for (const log of deploymentLogs) {
    const meta = DEPLOY_ACTION_META[log.action] ?? DEPLOY_ACTION_META.deploy
    const versionInfo = log.toVersion ? ` v${log.toVersion}` : ""
    events.push({
      id: log.id,
      icon: meta.icon,
      iconColor: meta.color,
      description: `${log.performedBy}님이 ${log.promptName}을 ${log.environment}에 ${meta.label}${versionInfo}`,
      timestamp: log.performedAt,
    })
  }

  for (const log of activityLogs) {
    const meta = ACTIVITY_ACTION_META[log.action] ?? ACTIVITY_ACTION_META.invited
    events.push({
      id: log.id,
      icon: meta.icon,
      iconColor: meta.color,
      description: `${log.performedBy}님이 ${log.memberName}을 ${meta.label}`,
      timestamp: log.createdAt,
    })
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const visibleEvents = events.slice(0, maxItems)

  return (
    <div className="card p-4 md:p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Activity</h3>
      {visibleEvents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {visibleEvents.map((event) => {
            const Icon = event.icon
            return (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  <Icon className={`h-4 w-4 ${event.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{event.description}</p>
                  <p className="text-xs text-muted-foreground">{formatTimeAgo(event.timestamp)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
