'use client'

import { cn } from '@/lib/utils'
import type { ToolPermission, ToolPolicy } from '@agent-studio/shared'
import type { CardDefinition } from '@/lib/api-client'

interface Props {
  permissions: ToolPermission[]
  toolIds: string[]
  toolNames?: Record<string, string>
  hitlCards?: CardDefinition[]
  onChange: (perms: ToolPermission[]) => void
}

const POLICY_OPTIONS: { value: ToolPolicy; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: '자동으로 실행' },
  { value: 'requires_approval', label: 'Requires Approval', description: '실행 전 승인 필요' },
  { value: 'restricted', label: 'Restricted', description: '조건부 실행 허용' },
  { value: 'disabled', label: 'Disabled', description: '사용 불가' },
]

const POLICY_BADGE: Record<ToolPolicy, string> = {
  auto: 'bg-green-500/15 text-green-400',
  requires_approval: 'bg-amber-500/15 text-amber-400',
  restricted: 'bg-orange-500/15 text-orange-400',
  disabled: 'bg-red-500/15 text-red-400',
}

function getPermission(permissions: ToolPermission[], toolId: string): ToolPermission {
  return permissions.find((p) => p.toolId === toolId) ?? { toolId, policy: 'auto' }
}

export function ToolPermissionsPanel({ permissions, toolIds, toolNames, hitlCards, onChange }: Props) {
  if (toolIds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-8 text-center">
        <p className="text-xs text-[var(--color-fg-subtle)]">선택된 도구가 없습니다</p>
        <p className="text-xs text-[var(--color-fg-subtle)] mt-1">위에서 도구를 선택하면 권한 설정이 가능합니다</p>
      </div>
    )
  }

  const updatePerm = (toolId: string, patch: Partial<ToolPermission>) => {
    const existing = getPermission(permissions, toolId)
    const updated = { ...existing, ...patch }
    const rest = permissions.filter((p) => p.toolId !== toolId)
    onChange([...rest, updated])
  }

  return (
    <div className="space-y-2">
      {toolIds.map((toolId) => {
        const perm = getPermission(permissions, toolId)
        const name = toolNames?.[toolId] || toolId
        const displayName = name.length > 30 ? name.slice(0, 30) + '…' : name

        return (
          <div
            key={toolId}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-fg)] truncate">{displayName}</span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold', POLICY_BADGE[perm.policy])}>
                    {perm.policy}
                  </span>
                </div>
                {name !== toolId && (
                  <p className="text-xs text-[var(--color-fg-subtle)] font-mono truncate">{toolId}</p>
                )}
              </div>
              <select
                value={perm.policy}
                onChange={(e) => updatePerm(toolId, { policy: e.target.value as ToolPolicy })}
                className="shrink-0 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-fg)] focus:border-blue-500 focus:outline-none"
              >
                {POLICY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {perm.policy === 'restricted' && (
              <div className="mt-2">
                <input
                  className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                  placeholder="실행 허용 조건 (예: user.role === 'admin')"
                  value={perm.conditions ?? ''}
                  onChange={(e) => updatePerm(toolId, { conditions: e.target.value })}
                />
              </div>
            )}

            {perm.policy === 'requires_approval' && (() => {
              const allCards = hitlCards ?? []
              const toolName = toolNames?.[toolId] ?? toolId
              const matches = (c: CardDefinition) => {
                const targets = (c as { targetTools?: string[] }).targetTools ?? []
                return targets.includes(toolId) || targets.includes(toolName)
              }
              const matched = allCards.filter(matches)
              const others = allCards.filter((c) => !matches(c))
              return (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[var(--color-fg-subtle)] shrink-0">HITL 카드</span>
                  <select
                    value={perm.cardId ?? ''}
                    onChange={(e) => updatePerm(toolId, { cardId: e.target.value || undefined })}
                    className="flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-fg)] focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">기본 (hitl-input-card)</option>
                    {matched.length > 0 && (
                      <optgroup label="이 도구에 매핑된 카드">
                        {matched.map((c) => (
                          <option key={c.cardId} value={c.cardId}>
                            {c.name} ({c.cardId})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label={matched.length > 0 ? '기타 카드' : '전체 카드'}>
                        {others.map((c) => (
                          <option key={c.cardId} value={c.cardId}>
                            {c.name} ({c.cardId})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
