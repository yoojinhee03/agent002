'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiClient, type Skill } from '@/lib/api-client'
import type { Agent, UpdateAgentRequest } from '@agent-studio/shared'
import { Sparkles, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}

export function SkillsTab({ agent, onChange }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedIds = useMemo(() => {
    const availableIds = new Set(skills.map((s) => s.id))
    return new Set((agent.skillIds ?? []).filter((id) => availableIds.has(id)))
  }, [agent.skillIds, skills])

  useEffect(() => {
    apiClient.skills
      .list()
      .then((rows) => setSkills(rows))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Skills 로딩 실패'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ skillIds: [...next] })
  }

  if (loading) {
    return <div className="px-6 pt-4 text-xs text-fg-subtle">불러오는 중…</div>
  }
  if (error) {
    return <div className="px-6 pt-4 text-xs text-red-400">{error}</div>
  }

  if (skills.length === 0) {
    return (
      <div className="space-y-3 px-6 pt-4">
        <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-6 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-fg-subtle" />
          <p className="mt-2 text-xs text-fg-subtle">아직 생성한 Skill이 없습니다.</p>
          <Link
            href="/skills"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#3B82F6] hover:text-[#60A5FA]"
          >
            Skills 페이지로 이동 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 px-6 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-subtle">
          체크한 Skill의 메타데이터(name + description)가 시스템 프롬프트에 자동 포함되고, 모델은 필요할 때 SKILL.md 본문을 직접 읽습니다.
        </p>
        <Link
          href="/skills"
          className="ml-2 shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#3B82F6] hover:text-[#60A5FA]"
        >
          관리 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => {
          const isSelected = selectedIds.has(skill.id)
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => toggle(skill.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                isSelected
                  ? 'border-[#3B82F6]/50 bg-[#101728]'
                  : 'border-border bg-bg hover:border-[#1f2740]',
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(skill.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 h-3.5 w-3.5 cursor-pointer accent-[#3B82F6]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-fg">{skill.name}</span>
                  {!skill.enabled && (
                    <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs uppercase text-fg-subtle">
                      비활성
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{skill.description}</p>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-fg-subtle">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    파일 {skill.files?.length ?? 0}개
                  </span>
                  {skill.allowedTools?.length > 0 && (
                    <span>허용 도구 {skill.allowedTools.length}개</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
