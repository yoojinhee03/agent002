'use client'

import { useState } from 'react'
import { Download, Eye, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { apiClient, type ThreadAttachment } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  attachment: ThreadAttachment
  onPreview: (attachment: ThreadAttachment) => void
  /** 'client' = client 채팅(테마 변수), 'studio' = studio 디버그(고정 색) */
  variant?: 'client' | 'studio'
  className?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentInlineRow({ attachment, onPreview, variant = 'client', className }: Props) {
  const [downloading, setDownloading] = useState(false)
  const isImage = attachment.mimeType.startsWith('image/')

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      const blob = await apiClient.attachments.fetchBlob(attachment.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.originalName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '다운로드에 실패했습니다')
    } finally {
      setDownloading(false)
    }
  }

  const isStudio = variant === 'studio'
  const rowCls = isStudio
    ? 'border border-border bg-[var(--color-bg)] text-fg'
    : 'border'
  const rowStyle = isStudio
    ? undefined
    : {
        borderColor: 'var(--client-border)',
        background: 'var(--client-bg)',
        color: 'var(--client-text)',
      }
  const btnCls = isStudio
    ? 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
    : 'border'
  const btnStyle = isStudio
    ? undefined
    : {
        borderColor: 'var(--client-border)',
        color: 'var(--client-muted-2)',
      }

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs',
        rowCls,
        className,
      )}
      style={rowStyle}
    >
      {isImage ? (
        <ImageIcon className="h-4 w-4 shrink-0 text-sky-500" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={attachment.originalName}>
          {attachment.originalName}
        </p>
        <p className="text-[10.5px] opacity-60">{formatSize(attachment.size)}</p>
      </div>
      <button
        type="button"
        onClick={() => onPreview(attachment)}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
          btnCls,
        )}
        style={btnStyle}
        title="미리보기"
      >
        <Eye className="h-3 w-3" />
        미리보기
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50',
          btnCls,
        )}
        style={btnStyle}
        title="다운로드"
      >
        {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        다운로드
      </button>
    </div>
  )
}
