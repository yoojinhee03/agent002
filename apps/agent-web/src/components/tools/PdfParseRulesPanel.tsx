'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, GripVertical } from 'lucide-react'

interface CheckRule {
  ruleCode: string
  ruleName: string
  llmQuestion: string
  passCondition: string
  failMessage: string
  severity: 'FAIL' | 'WARNING'
  thresholdDays?: number
}

interface DocTypeConfig {
  id?: string
  docType: string
  identifyKeywords: string[]
  rules: CheckRule[]
}

interface Props {
  agentId: string
}

const SEVERITY_LABEL: Record<string, string> = {
  FAIL: '필수 보완',
  WARNING: '권고',
}

const EMPTY_RULE = (): CheckRule => ({
  ruleCode: '',
  ruleName: '',
  llmQuestion: '',
  passCondition: '',
  failMessage: '',
  severity: 'FAIL',
})

const EMPTY_DOC = (): DocTypeConfig => ({
  docType: '',
  identifyKeywords: [],
  rules: [EMPTY_RULE()],
})

export function PdfParseRulesPanel({ agentId }: Props) {
  const [configs, setConfigs] = useState<DocTypeConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set())
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [keywordInputs, setKeywordInputs] = useState<Record<number, string>>({})
  const [saved, setSaved] = useState(false)

  const parseConfigs = (raw: unknown): DocTypeConfig[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        id: typeof x.id === 'string' ? x.id : undefined,
        docType: typeof x.docType === 'string' ? x.docType : '',
        identifyKeywords: Array.isArray(x.identifyKeywords)
          ? (x.identifyKeywords.filter((k) => typeof k === 'string') as string[])
          : [],
        rules: Array.isArray(x.rules)
          ? (x.rules
            .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
            .map((r) => {
              const severity: CheckRule['severity'] = r.severity === 'WARNING' ? 'WARNING' : 'FAIL'
              return {
                ruleCode: typeof r.ruleCode === 'string' ? r.ruleCode : '',
                ruleName: typeof r.ruleName === 'string' ? r.ruleName : '',
                llmQuestion: typeof r.llmQuestion === 'string' ? r.llmQuestion : '',
                passCondition: typeof r.passCondition === 'string' ? r.passCondition : '',
                failMessage: typeof r.failMessage === 'string' ? r.failMessage : '',
                severity,
                thresholdDays: typeof r.thresholdDays === 'number' ? r.thresholdDays : undefined,
              }
            }))
          : [EMPTY_RULE()],
      }))
      .map((d) => ({ ...d, rules: d.rules.length > 0 ? d.rules : [EMPTY_RULE()] }))
  }

  useEffect(() => {
    apiClient.tools.getPdfParseRules(agentId)
      .then((data) => {
        const parsed = parseConfigs(data)
        setConfigs(parsed)
        setExpandedDocs(new Set(parsed.map((_, i) => i)))
      })
      .catch(() => setConfigs([]))
      .finally(() => setLoading(false))
  }, [agentId])

  const toggleDoc = (i: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const toggleRule = (key: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const updateDoc = (i: number, patch: Partial<DocTypeConfig>) => {
    setConfigs((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  }

  const updateRule = (docIdx: number, ruleIdx: number, patch: Partial<CheckRule>) => {
    setConfigs((prev) => prev.map((d, di) => {
      if (di !== docIdx) return d
      return {
        ...d,
        rules: d.rules.map((r, ri) => ri === ruleIdx ? { ...r, ...patch } : r),
      }
    }))
  }

  const addDoc = () => {
    const newIdx = configs.length
    setConfigs((prev) => [...prev, EMPTY_DOC()])
    setExpandedDocs((prev) => new Set([...prev, newIdx]))
  }

  const removeDoc = (i: number) => {
    setConfigs((prev) => prev.filter((_, idx) => idx !== i))
  }

  const addRule = (docIdx: number) => {
    setConfigs((prev) => prev.map((d, i) => {
      if (i !== docIdx) return d
      const newRule = EMPTY_RULE()
      const ruleIdx = d.rules.length
      setExpandedRules((prev2) => new Set([...prev2, `${docIdx}-${ruleIdx}`]))
      return { ...d, rules: [...d.rules, newRule] }
    }))
  }

  const removeRule = (docIdx: number, ruleIdx: number) => {
    setConfigs((prev) => prev.map((d, i) => {
      if (i !== docIdx) return d
      return { ...d, rules: d.rules.filter((_, ri) => ri !== ruleIdx) }
    }))
  }

  const addKeyword = (docIdx: number) => {
    const val = (keywordInputs[docIdx] ?? '').trim()
    if (!val) return
    updateDoc(docIdx, {
      identifyKeywords: [...(configs[docIdx].identifyKeywords ?? []), val],
    })
    setKeywordInputs((prev) => ({ ...prev, [docIdx]: '' }))
  }

  const removeKeyword = (docIdx: number, kIdx: number) => {
    updateDoc(docIdx, {
      identifyKeywords: configs[docIdx].identifyKeywords.filter((_, i) => i !== kIdx),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiClient.tools.savePdfParseRules(agentId, configs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-fg-subtle)]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-fg-subtle)]">
          서류 종류별 검증 규칙을 설정합니다. 파일명 키워드로 서류를 자동 식별하고, 규칙에 따라 Vision AI가 검증합니다.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={addDoc}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-border-strong)] transition-colors"
          >
            <Plus className="h-3 w-3" />
            서류 추가
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors',
              saved
                ? 'bg-green-500/20 text-green-400'
                : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50',
            )}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {saved ? '저장됨' : saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {configs.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center">
          <p className="text-xs text-[var(--color-fg-subtle)]">등록된 서류 종류가 없습니다.</p>
          <button
            onClick={addDoc}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
          >
            첫 번째 서류 추가하기
          </button>
        </div>
      )}

      {/* 서류 목록 */}
      {configs.map((doc, docIdx) => {
        const isExpanded = expandedDocs.has(docIdx)
        return (
          <div key={docIdx} className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] overflow-hidden">
            {/* 서류 헤더 */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <GripVertical className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
              <button
                onClick={() => toggleDoc(docIdx)}
                className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />
                }
              </button>
              <input
                value={doc.docType}
                onChange={(e) => updateDoc(docIdx, { docType: e.target.value })}
                placeholder="서류명 (예: 주민등록등본)"
                className="flex-1 bg-transparent text-xs font-medium text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:outline-none"
              />
              <span className="text-xs text-[var(--color-fg-subtle)] shrink-0">
                규칙 {doc.rules.length}개
              </span>
              <button
                onClick={() => removeDoc(docIdx)}
                className="shrink-0 text-fg-subtle hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-[var(--color-border)] px-3 py-3 space-y-3">
                {/* 식별 키워드 */}
                <div>
                  <p className="text-xs text-[var(--color-fg-subtle)] mb-1.5 font-medium">파일명 식별 키워드</p>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {doc.identifyKeywords.map((kw, kIdx) => (
                      <span
                        key={kIdx}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-xs text-[var(--color-fg-muted)]"
                      >
                        {kw}
                        <button
                          onClick={() => removeKeyword(docIdx, kIdx)}
                          className="text-[var(--color-fg-subtle)] hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={keywordInputs[docIdx] ?? ''}
                      onChange={(e) => setKeywordInputs((prev) => ({ ...prev, [docIdx]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addKeyword(docIdx)}
                      placeholder="키워드 입력 후 Enter (예: 주민등록등본)"
                      className="flex-1 rounded-lg border border-[var(--color-border)] bg-bg px-2.5 py-1 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={() => addKeyword(docIdx)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:bg-[var(--color-border-strong)] transition-colors"
                    >
                      추가
                    </button>
                  </div>
                </div>

                {/* 규칙 목록 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-[var(--color-fg-subtle)] font-medium">검증 규칙</p>
                    <button
                      onClick={() => addRule(docIdx)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      규칙 추가
                    </button>
                  </div>

                  <div className="space-y-2">
                    {doc.rules.map((rule, ruleIdx) => {
                      const ruleKey = `${docIdx}-${ruleIdx}`
                      const isRuleExpanded = expandedRules.has(ruleKey)
                      return (
                        <div key={ruleIdx} className="rounded-lg border border-[var(--color-border)] bg-bg overflow-hidden">
                          {/* 규칙 헤더 */}
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              onClick={() => toggleRule(ruleKey)}
                              className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
                            >
                              {isRuleExpanded
                                ? <ChevronDown className="h-3 w-3" />
                                : <ChevronRight className="h-3 w-3" />
                              }
                            </button>
                            <input
                              value={rule.ruleName}
                              onChange={(e) => updateRule(docIdx, ruleIdx, { ruleName: e.target.value })}
                              placeholder="규칙명 (예: 주민번호 마스킹 여부)"
                              className="flex-1 bg-transparent text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:outline-none"
                            />
                            <select
                              value={rule.severity}
                              onChange={(e) => updateRule(docIdx, ruleIdx, { severity: e.target.value as 'FAIL' | 'WARNING' })}
                              className="shrink-0 rounded bg-[var(--color-surface-2)] border-0 text-xs text-[var(--color-fg-muted)] px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="FAIL">필수 보완</option>
                              <option value="WARNING">권고</option>
                            </select>
                            <button
                              onClick={() => removeRule(docIdx, ruleIdx)}
                              className="shrink-0 text-fg-subtle hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          {/* 규칙 상세 */}
                          {isRuleExpanded && (
                            <div className="border-t border-[var(--color-border)] px-3 py-2.5 space-y-2">
                              <div>
                                <label className="text-xs text-[var(--color-fg-subtle)] block mb-1">규칙 코드</label>
                                <input
                                  value={rule.ruleCode}
                                  onChange={(e) => updateRule(docIdx, ruleIdx, { ruleCode: e.target.value })}
                                  placeholder="MASKING_CHECK"
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-[var(--color-fg-subtle)] block mb-1">
                                  Vision AI 검증 질문
                                  <span className="ml-1 text-[var(--color-fg-subtle)]">— AI가 이미지를 보고 판단할 질문</span>
                                </label>
                                <textarea
                                  value={rule.llmQuestion}
                                  onChange={(e) => updateRule(docIdx, ruleIdx, { llmQuestion: e.target.value })}
                                  placeholder="주민등록번호 뒷자리 7자리가 * 또는 ■ 기호로 마스킹 처리되어 있습니까?"
                                  rows={2}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-[var(--color-fg-subtle)] block mb-1">
                                  PASS 판단 기준
                                  <span className="ml-1 text-[var(--color-fg-subtle)]">— {'{today}'}, {'{threshold_days}'} 플레이스홀더 사용 가능</span>
                                </label>
                                <textarea
                                  value={rule.passCondition}
                                  onChange={(e) => updateRule(docIdx, ruleIdx, { passCondition: e.target.value })}
                                  placeholder="뒷자리가 모두 *나 ■로 가려진 경우 PASS"
                                  rows={2}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-[var(--color-fg-subtle)] block mb-1">
                                  실패 시 피드백 메시지
                                  <span className="ml-1 text-[var(--color-fg-subtle)]">— 지원자에게 발송될 보완 요청 문구</span>
                                </label>
                                <textarea
                                  value={rule.failMessage}
                                  onChange={(e) => updateRule(docIdx, ruleIdx, { failMessage: e.target.value })}
                                  placeholder="주민번호 뒷자리가 마스킹 처리된 등본으로 재제출 요망"
                                  rows={2}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-[var(--color-fg-subtle)] block mb-1">
                                  발급일 기준 (일)
                                  <span className="ml-1 text-[var(--color-fg-subtle)]">— 날짜 비교 규칙에만 입력 (예: 90일)</span>
                                </label>
                                <input
                                  type="number"
                                  value={rule.thresholdDays ?? ''}
                                  onChange={(e) => updateRule(docIdx, ruleIdx, {
                                    thresholdDays: e.target.value ? Number(e.target.value) : undefined,
                                  })}
                                  placeholder="비어있으면 날짜 비교 안 함"
                                  min={1}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
