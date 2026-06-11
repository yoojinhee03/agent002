'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Agent, UpdateAgentRequest, ReasoningConfig } from '@agent-studio/shared'
import type { EnabledModel } from '@/types/provider'

interface Props {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 px-6">
      <label className="section-title">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

export function BasicTab({ agent, onChange }: Props) {
  const [models, setModels] = useState<EnabledModel[]>([])
  const reasoningCfg: ReasoningConfig = (agent.reasoningConfig as ReasoningConfig) ?? {}
  const stepLimit = reasoningCfg.stepLimit ?? 40

  useEffect(() => {
    apiClient.providers.getEnabledModels().then(setModels).catch(() => {})
  }, [])

  return (
    <div className="space-y-6 pt-2">
      {/* 에이전트 이름 */}
      <Field label="Agent Name" required>
        <input
          className="input"
          defaultValue={agent.name}
          onBlur={e => onChange({ name: e.target.value })}
          placeholder="이름을 입력하세요"
        />
      </Field>

      {/* 모델 선택 */}
      <Field label="Brain Model">
        <select
          className="input"
          value={agent.modelId}
          onChange={e => onChange({ modelId: e.target.value })}
        >
          {models.length === 0 && (
            <option value={agent.modelId}>{agent.modelId}</option>
          )}
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Field>

      {/* 설명 */}
      <Field label="Purpose (Description)">
        <textarea
          className="input h-20 resize-none"
          defaultValue={agent.description}
          onBlur={e => onChange({ description: e.target.value })}
          placeholder="이 에이전트의 역할과 목적을 적어주세요"
        />
      </Field>

      {/* Step Limit */}
      <div className="space-y-2 px-6">
        <div className="flex items-center justify-between">
          <label className="section-title">Step Limit (도구 호출 제한)</label>
          <span className="text-xs font-bold text-blue-400">{stepLimit}</span>
        </div>
        <input
          type="range"
          min={1}
          max={200}
          step={1}
          value={stepLimit}
          onChange={e =>
            onChange({ reasoningConfig: { ...reasoningCfg, stepLimit: parseInt(e.target.value, 10) } })
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--color-surface-2)] accent-blue-500"
        />
        <div className="flex justify-between text-xs text-[var(--color-fg-subtle)]">
          <span>1</span>
          <span>200</span>
        </div>
      </div>
    </div>
  )
}
