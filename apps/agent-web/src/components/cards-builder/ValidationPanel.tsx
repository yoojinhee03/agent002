'use client'

import { useMemo } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react'
import type { ValidationReport } from '@/lib/cards/ac-validate'

interface Props {
  report: ValidationReport
  onAutoFillSample?: (missing: string[]) => void
  payloadParseError?: string | null
}

export function ValidationPanel({ report, onAutoFillSample, payloadParseError }: Props) {
  const ok = useMemo(
    () =>
      !payloadParseError &&
      report.errors.length === 0 &&
      report.warnings.length === 0 &&
      report.unresolved.length === 0,
    [payloadParseError, report],
  )

  if (payloadParseError) {
    return (
      <div className="border-t border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-200">
        <AlertCircle className="mr-1 inline h-3 w-3" />
        payload JSON 오류: {payloadParseError}
      </div>
    )
  }

  if (ok) {
    return (
      <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-200">
        <CheckCircle2 className="mr-1 inline h-3 w-3" />
        검증 통과 — 모든 ${'{...}'} 토큰이 샘플 데이터로 채워졌습니다.
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-bg/40 max-h-48 overflow-y-auto px-3 py-2 text-[11px]">
      {report.errors.length > 0 && (
        <Section
          icon={<AlertCircle className="h-3 w-3 text-red-300" />}
          title="오류"
          tone="text-red-200"
        >
          {report.errors.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </Section>
      )}
      {report.warnings.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-3 w-3 text-amber-300" />}
          title="경고"
          tone="text-amber-200"
        >
          {report.warnings.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </Section>
      )}
      {report.unresolved.length > 0 && (
        <Section
          icon={<KeyRound className="h-3 w-3 text-blue-300" />}
          title="미해결 ${...} 토큰"
          tone="text-blue-200"
          action={
            onAutoFillSample && (
              <button
                type="button"
                onClick={() => onAutoFillSample(report.unresolved)}
                className="ml-2 inline-flex items-center gap-1 rounded border border-border bg-bg/60 px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                title="누락된 키를 샘플 데이터에 추가"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                샘플 자동 채움
              </button>
            )
          }
        >
          {report.unresolved.map((t) => (
            <li key={t}>
              <code className="rounded bg-bg/60 px-1 text-[10px] text-blue-300">${`{${t}}`}</code>
              <span className="ml-2 text-fg-subtle">샘플 데이터에 해당 키가 없습니다</span>
            </li>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  tone,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle">
        {icon}
        <span>{title}</span>
        {action}
      </div>
      <ul className={`mt-1 ml-4 list-disc space-y-0.5 ${tone}`}>{children}</ul>
    </div>
  )
}
