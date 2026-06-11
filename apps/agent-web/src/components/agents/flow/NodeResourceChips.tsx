'use client'

import { Wrench, Sparkles, Plug, BookOpen, Lock, AlertTriangle, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentGraphResources } from './agent-graph-resources'

type ToolPolicy = 'auto' | 'requires_approval' | 'restricted' | 'disabled'

export interface NodeResourceChipsInput {
  toolIds?: string[]
  builtinToolIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: Array<{ serverId: string; toolName: string }>
  skillIds?: string[]
  toolPermissions?: Record<string, ToolPolicy>
  expanded: boolean
}

interface ChipItem {
  key: string
  label: string
  policy?: ToolPolicy
}

interface Group {
  id: 'tools' | 'builtin' | 'mcp' | 'skills'
  Icon: typeof Wrench
  colorClass: string
  borderClass: string
  iconColorClass: string
  items: ChipItem[]
}

const MAX_VISIBLE_PER_GROUP = 3

function policyMark(policy?: ToolPolicy) {
  if (!policy || policy === 'auto') return null
  const map: Record<Exclude<ToolPolicy, 'auto'>, { Icon: typeof Lock; cls: string; title: string }> = {
    requires_approval: { Icon: Lock, cls: 'text-amber-400', title: '승인 필요' },
    restricted: { Icon: AlertTriangle, cls: 'text-orange-400', title: '제한됨' },
    disabled: { Icon: Ban, cls: 'text-red-400', title: '비활성화' },
  }
  const m = map[policy]
  return <m.Icon className={cn('h-2.5 w-2.5 shrink-0', m.cls)} aria-label={m.title} />
}

function Chip({
  Icon,
  iconColorClass,
  borderClass,
  label,
  policy,
}: {
  Icon: typeof Wrench
  iconColorClass: string
  borderClass: string
  label: string
  policy?: ToolPolicy
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[140px] items-center gap-1 rounded-md border bg-bg px-1.5 py-0.5 text-xs text-fg',
        borderClass,
      )}
      title={label}
    >
      <Icon className={cn('h-2.5 w-2.5 shrink-0', iconColorClass)} />
      <span className="truncate">{label}</span>
      {policyMark(policy)}
    </span>
  )
}

function OverflowChip({
  count,
  hiddenLabels,
  Icon,
  iconColorClass,
  borderClass,
}: {
  count: number
  hiddenLabels: string[]
  Icon: typeof Wrench
  iconColorClass: string
  borderClass: string
}) {
  return (
    <span className="group relative inline-flex">
      <span
        className={cn(
          'inline-flex cursor-default items-center gap-1 rounded-md border bg-bg px-1.5 py-0.5 text-xs text-fg-muted',
          borderClass,
        )}
      >
        <Icon className={cn('h-2.5 w-2.5 shrink-0', iconColorClass)} />
        <span>+{count}</span>
      </span>
      <span
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 group-hover:block"
        role="tooltip"
      >
        <span className="block max-w-[240px] rounded-md border border-border bg-bg px-2 py-1.5 text-xs leading-snug text-fg shadow-lg">
          {hiddenLabels.map((l, i) => (
            <span key={i} className="block truncate">
              • {l}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

export function NodeResourceChips(input: NodeResourceChipsInput) {
  const { toolsById, mcpServersById, skillsById, builtinDisplayNames } = useAgentGraphResources()
  const {
    toolIds = [],
    builtinToolIds = [],
    mcpServerIds = [],
    mcpToolRefs = [],
    skillIds = [],
    toolPermissions,
    expanded,
  } = input

  const mcpItems: ChipItem[] = mcpToolRefs.length > 0
    ? mcpToolRefs.map((r) => ({
        key: `${r.serverId}:${r.toolName}`,
        label: `${mcpServersById[r.serverId]?.name ?? r.serverId.slice(0, 6)} · ${r.toolName}`,
      }))
    : mcpServerIds.map((id) => ({ key: id, label: mcpServersById[id]?.name ?? id.slice(0, 6) }))

  const groups: Group[] = [
    {
      id: 'tools',
      Icon: Wrench,
      iconColorClass: 'text-blue-400',
      borderClass: 'border-blue-500/20',
      colorClass: 'text-blue-300',
      items: toolIds.map((id) => ({
        key: id,
        label: toolsById[id]?.name ?? id.slice(0, 6),
        policy: toolPermissions?.[id],
      })),
    },
    {
      id: 'builtin',
      Icon: Sparkles,
      iconColorClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/20',
      colorClass: 'text-emerald-300',
      items: builtinToolIds.map((id) => ({
        key: id,
        label: builtinDisplayNames[id] ?? id,
        policy: toolPermissions?.[id],
      })),
    },
    {
      id: 'mcp',
      Icon: Plug,
      iconColorClass: 'text-purple-400',
      borderClass: 'border-purple-500/20',
      colorClass: 'text-purple-300',
      items: mcpItems,
    },
    {
      id: 'skills',
      Icon: BookOpen,
      iconColorClass: 'text-amber-400',
      borderClass: 'border-amber-500/20',
      colorClass: 'text-amber-300',
      items: skillIds.map((id) => ({ key: id, label: skillsById[id]?.name ?? id.slice(0, 6) })),
    },
  ]

  const nonEmpty = groups.filter((g) => g.items.length > 0)
  if (nonEmpty.length === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1',
        expanded && 'max-h-[200px] overflow-y-auto',
      )}
    >
      {nonEmpty.map((g) => {
        const visible = expanded ? g.items : g.items.slice(0, MAX_VISIBLE_PER_GROUP)
        const hidden = expanded ? [] : g.items.slice(MAX_VISIBLE_PER_GROUP)
        return (
          <div key={g.id} className="flex flex-wrap gap-1">
            {visible.map((item) => (
              <Chip
                key={item.key}
                Icon={g.Icon}
                iconColorClass={g.iconColorClass}
                borderClass={g.borderClass}
                label={item.label}
                policy={item.policy}
              />
            ))}
            {hidden.length > 0 && (
              <OverflowChip
                count={hidden.length}
                hiddenLabels={hidden.map((i) => i.label)}
                Icon={g.Icon}
                iconColorClass={g.iconColorClass}
                borderClass={g.borderClass}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
