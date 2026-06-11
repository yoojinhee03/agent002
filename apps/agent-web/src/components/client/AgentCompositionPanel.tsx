'use client'

import { Bot, GitBranch, GraduationCap } from 'lucide-react'
import type {
  AgentComposition,
  RequiredCredential,
  SkillRef,
  SubAgentRef,
  ToolRef,
} from '@agent-studio/shared'
import { ToolBadgeList } from './ToolBadgeList'

interface Props {
  composition: AgentComposition
  requiredCredentials?: RequiredCredential[]
  missingCredentials?: RequiredCredential[]
}

export function AgentCompositionPanel({
  composition,
  requiredCredentials,
  missingCredentials,
}: Props) {
  const haveCredentials = computeHaveCredentials(requiredCredentials, missingCredentials)
  const { main, subAgents } = composition

  return (
    <div className="space-y-4">
      <section className="client-panel p-5">
        <SectionHeader icon={<Bot className="h-4 w-4" />} title="메인 에이전트" />
        <CompositionBody skills={main.skills} tools={main.tools} haveCredentials={haveCredentials} />
      </section>

      {subAgents.length > 0 && (
        <section className="client-panel p-5">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title="서브 에이전트"
            count={subAgents.length}
          />
          <div className="space-y-3">
            {subAgents.map((sub) => (
              <SubAgentCard key={sub.id} sub={sub} haveCredentials={haveCredentials} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SubAgentCard({
  sub,
  haveCredentials,
}: {
  sub: SubAgentRef
  haveCredentials: Set<string>
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--client-border)', background: 'var(--client-bg)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
        >
          <Bot className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
            {sub.name}
          </p>
          <p className="truncate text-xs" style={{ color: 'var(--client-muted-2)' }}>
            {[sub.role, sub.modelName].filter(Boolean).join(' · ') || '역할 미지정'}
          </p>
        </div>
      </div>
      <CompositionBody skills={sub.skills} tools={sub.tools} haveCredentials={haveCredentials} />
    </div>
  )
}

function CompositionBody({
  skills,
  tools,
  haveCredentials,
}: {
  skills: SkillRef[]
  tools: ToolRef[]
  haveCredentials: Set<string>
}) {
  return (
    <div className="space-y-3">
      <div>
        <SubHeader icon={<GraduationCap className="h-3.5 w-3.5" />} label="스킬" count={skills.length} />
        {skills.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
            등록된 스킬 없음
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill.id}
                title={skill.description}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                style={{
                  borderColor: 'var(--client-border-2)',
                  color: 'var(--client-muted)',
                }}
              >
                <GraduationCap className="h-3 w-3" />
                {skill.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <SubHeader label="도구" count={tools.length} />
        <ToolBadgeList tools={tools} haveCredentials={haveCredentials} />
      </div>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count?: number
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span style={{ color: 'var(--client-muted)' }}>{icon}</span>
      <h3 className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
        {title}
      </h3>
      {count != null && (
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

function SubHeader({
  icon,
  label,
  count,
}: {
  icon?: React.ReactNode
  label: string
  count: number
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
      {icon}
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <span>· {count}</span>
    </div>
  )
}

function computeHaveCredentials(
  required?: RequiredCredential[],
  missing?: RequiredCredential[],
): Set<string> {
  if (!required) return new Set()
  const missingKeys = new Set((missing ?? []).map((m) => `${m.kind}:${m.targetId}`))
  const ready = new Set<string>()
  for (const r of required) {
    const key = `${r.kind}:${r.targetId}`
    if (!missingKeys.has(key)) ready.add(key)
  }
  return ready
}
