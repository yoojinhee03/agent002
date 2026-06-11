'use client'

import { useState } from 'react'
import type { Agent, UpdateAgentRequest, GuardrailsConfig, OutputFilter } from '@agent-studio/shared'
import { X, Plus, Shield, Zap } from 'lucide-react'

function DeepAgentBadge() {
  return (
    <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-500">
      <Zap className="h-2 w-2" />DeepAgent 조건
    </span>
  )
}
import { cn } from '@/lib/utils'

interface Props {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}

export function GuardrailsTab({ agent, onChange }: Props) {
  const cfg: GuardrailsConfig = (agent.guardrailsConfig as GuardrailsConfig) ?? {}
  const [newTopic, setNewTopic] = useState('')
  const [newFilter, setNewFilter] = useState<Partial<OutputFilter>>({ type: 'keyword', action: 'block', pattern: '' })

  const update = (patch: Partial<GuardrailsConfig>) => {
    onChange({ guardrailsConfig: { ...cfg, ...patch } })
  }

  const addTopic = () => {
    if (!newTopic.trim()) return
    update({ blockedTopics: [...(cfg.blockedTopics ?? []), newTopic.trim()] })
    setNewTopic('')
  }

  const removeTopic = (i: number) => {
    update({ blockedTopics: (cfg.blockedTopics ?? []).filter((_, idx) => idx !== i) })
  }

  const addFilter = () => {
    if (!newFilter.pattern?.trim()) return
    update({ outputFilters: [...(cfg.outputFilters ?? []), newFilter as OutputFilter] })
    setNewFilter({ type: 'keyword', action: 'block', pattern: '' })
  }

  const removeFilter = (i: number) => {
    update({ outputFilters: (cfg.outputFilters ?? []).filter((_, idx) => idx !== i) })
  }

  const safetyLevel = cfg.safetyLevel ?? 'medium'

  return (
    <div className="space-y-6 px-6 pt-2">

      {/* Safety Level */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">Safety Level</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['low',    'Low',    'text-green-400 border-green-500/30'],
            ['medium', 'Med',    'text-amber-400 border-amber-500/30'],
            ['high',   'High',   'text-red-400 border-red-500/30'],
          ] as const).map(([val, label, colors]) => (
            <button key={val}
              onClick={() => update({ safetyLevel: val })}
              className={cn('flex items-center justify-center rounded-lg border py-2 text-xs font-bold transition-all',
                safetyLevel === val ? `${colors} bg-white/5` : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Blocked Topics */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">금지 주제</div>
          <DeepAgentBadge />
        </div>
        <div className="flex gap-2">
          <input className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none" 
            placeholder="주제 입력 (Enter)"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTopic()}
          />
          <button onClick={addTopic} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:bg-[var(--color-border-strong)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {(cfg.blockedTopics ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(cfg.blockedTopics ?? []).map((topic, i) => (
              <span key={i} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-xs text-red-400">
                {topic}
                <button onClick={() => removeTopic(i)}><X className="h-2 w-2" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Output Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">출력 필터 규칙</div>
          <DeepAgentBadge />
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-2 space-y-2">
          <div className="grid grid-cols-1 gap-1.5">
            <select className="w-full rounded border border-[var(--color-border)] bg-bg px-2 py-1 text-xs text-[var(--color-fg)] focus:outline-none" 
              value={newFilter.type}
              onChange={e => setNewFilter(p => ({ ...p, type: e.target.value as OutputFilter['type'] }))}>
              <option value="keyword">Keyword</option>
              <option value="regex">Regex</option>
              <option value="llm_check">LLM Check</option>
            </select>
            <input className="w-full rounded border border-[var(--color-border)] bg-bg px-2 py-1 text-xs text-[var(--color-fg)] focus:outline-none" 
              placeholder="패턴 입력"
              value={newFilter.pattern}
              onChange={e => setNewFilter(p => ({ ...p, pattern: e.target.value }))}
            />
            <div className="flex items-center gap-1.5">
              <select className="flex-1 rounded border border-[var(--color-border)] bg-bg px-2 py-1 text-xs text-[var(--color-fg)] focus:outline-none" 
                value={newFilter.action}
                onChange={e => setNewFilter(p => ({ ...p, action: e.target.value as OutputFilter['action'] }))}>
                <option value="block">Block</option>
                <option value="mask">Mask</option>
                <option value="warn">Warn</option>
              </select>
              <button onClick={addFilter} className="flex h-7 w-7 items-center justify-center rounded bg-blue-600/10 text-blue-400 hover:bg-blue-600/20">
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        {(cfg.outputFilters ?? []).length > 0 && (
          <div className="space-y-1">
            {(cfg.outputFilters ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1">
                <span className="text-[8px] uppercase font-bold text-[var(--color-fg-subtle)] w-10 shrink-0">{f.type}</span>
                <code className="flex-1 text-xs text-[var(--color-fg)] truncate">{f.pattern}</code>
                <span className={cn('rounded px-1 py-0.5 text-[8px] font-bold uppercase',
                  f.action === 'block' ? 'text-red-400' :
                  f.action === 'mask' ? 'text-amber-400' : 'text-blue-400'
                )}>{f.action}</span>
                <button onClick={() => removeFilter(i)}><X className="h-3 w-3 text-[var(--color-fg-subtle)] hover:text-red-400" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-1.5">
        {([
          ['jsonSchemaValidation', 'JSON Validation', false],
          ['piiDetection', 'PII Masking', true],
        ] as const).map(([key, label, isDeepAgentCondition]) => (
          <div key={key} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold text-[var(--color-fg)]">{label}</div>
              {isDeepAgentCondition && <DeepAgentBadge />}
            </div>
            <button
              onClick={() => update({ [key]: !cfg[key] })}
              className={cn(
                "relative h-4 w-8 shrink-0 rounded-full transition-colors",
                cfg[key] ? "bg-blue-600" : "bg-[var(--color-border-strong)]"
              )}
            >
              <div className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                cfg[key] ? "translate-x-4" : "translate-x-0.5"
              )} />
            </button>
          </div>
        ))}
      </div>

      {/* Max Output Length */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">Max Output Tokens</div>
          <span className="text-xs font-bold text-blue-400">{cfg.maxOutputLength ?? 4000}</span>
        </div>
        <input type="range" min={100} max={8000} step={100} className="w-full accent-blue-500 h-1.5 rounded-lg bg-[var(--color-surface-2)] appearance-none cursor-pointer"
          value={cfg.maxOutputLength ?? 4000}
          onChange={e => update({ maxOutputLength: parseInt(e.target.value) })}
        />
      </div>
    </div>
  )
}

