'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmDialogContext = createContext<ConfirmFn | null>(null)

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

function ConfirmDialogView({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}) {
  const variant: ConfirmVariant = options.variant ?? 'default'
  const confirmText = options.confirmText ?? '확인'
  const cancelText = options.cancelText ?? '취소'
  const title = options.title ?? (variant === 'danger' ? '삭제 확인' : '확인')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-lg leading-none text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg">
            {options.message}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={cn(
              'rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors',
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500',
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handleClose = useCallback(
    (result: boolean) => {
      if (!pending) return
      pending.resolve(result)
      setPending(null)
    },
    [pending],
  )

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false)
      else if (e.key === 'Enter') handleClose(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, handleClose])

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialogView
          options={pending}
          onConfirm={() => handleClose(true)}
          onCancel={() => handleClose(false)}
        />
      )}
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider')
  }
  return ctx
}

export function useConfirmHelpers() {
  const confirm = useConfirm()
  return useMemo(
    () => ({
      confirm,
      confirmDelete: (message: string, title = '삭제 확인') =>
        confirm({ title, message, variant: 'danger', confirmText: '삭제' }),
    }),
    [confirm],
  )
}
