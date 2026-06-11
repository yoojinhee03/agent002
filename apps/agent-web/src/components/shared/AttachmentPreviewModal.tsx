'use client'

import { useEffect, useState } from 'react'
import { Download, FileWarning, Loader2, X } from 'lucide-react'
import { apiClient, type ThreadAttachment } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface Props {
  attachment: ThreadAttachment | null
  onClose: () => void
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'docx' | 'xlsx' | 'hwp' | 'unsupported'

function detectKind(mimeType: string, name: string): PreviewKind {
  const mt = (mimeType || '').toLowerCase()
  const lower = name.toLowerCase()
  if (mt.startsWith('image/')) return 'image'
  if (mt === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (
    mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    return 'docx'
  }
  if (
    mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    lower.endsWith('.xlsx')
  ) {
    return 'xlsx'
  }
  if (
    lower.endsWith('.hwp') ||
    lower.endsWith('.hwpx') ||
    mt.includes('hwp') ||
    mt.includes('hancom') ||
    mt.includes('haansoft')
  ) {
    return 'hwp'
  }
  if (
    mt.startsWith('text/') ||
    mt === 'application/json' ||
    mt === 'application/xml' ||
    /\.(md|txt|csv|tsv|json|xml|ya?ml|toml|log|ini|sh|py|ts|tsx|js|jsx|css|html)$/i.test(name)
  ) {
    return 'text'
  }
  return 'unsupported'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [xlsxSheets, setXlsxSheets] = useState<Array<{ name: string; html: string }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attachment) return

    let active = true
    let createdUrl: string | null = null
    const kind = detectKind(attachment.mimeType, attachment.originalName)

    setLoading(true)
    setError(null)
    setBlobUrl(null)
    setTextContent(null)
    setDocxHtml(null)
    setXlsxSheets(null)

    apiClient.attachments
      .fetchBlob(attachment.id)
      .then(async (blob) => {
        if (!active) return
        // 모든 종류에 대해 blob URL 을 만들어 다운로드 버튼이 작동하도록 한다.
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
        if (kind === 'text') {
          const text = await blob.text()
          if (!active) return
          setTextContent(text)
          return
        }
        if (kind === 'docx') {
          const arrayBuffer = await blob.arrayBuffer()
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer })
          if (!active) return
          setDocxHtml(result.value)
          return
        }
        if (kind === 'xlsx') {
          const arrayBuffer = await blob.arrayBuffer()
          const XLSX = await import('xlsx')
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          const sheets = workbook.SheetNames.map((sheetName) => ({
            name: sheetName,
            html: XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]),
          }))
          if (!active) return
          setXlsxSheets(sheets)
          return
        }
        // image / pdf / hwp / unsupported 는 blobUrl 만으로 충분 (각각 inline 렌더 / 안내 패널).
      })
      .catch((e: unknown) => {
        if (!active) return
        setError(e instanceof Error ? e.message : '미리보기에 실패했습니다')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [attachment])

  if (!attachment) return null

  const kind = detectKind(attachment.mimeType, attachment.originalName)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-fg)]" title={attachment.originalName}>
              {attachment.originalName}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
              {attachment.mimeType || 'unknown'} · {formatSize(attachment.size)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {blobUrl && (
              <a
                href={blobUrl}
                download={attachment.originalName}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                title="다운로드"
              >
                <Download className="h-3.5 w-3.5" />
                다운로드
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              title="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            'flex-1 overflow-auto',
            kind === 'image' && 'flex items-center justify-center bg-[#05060a]',
          )}
        >
          {loading && (
            <div className="flex h-full items-center justify-center text-[var(--color-fg-subtle)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          )}
          {error && !loading && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {kind === 'image' && blobUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={blobUrl}
                  alt={attachment.originalName}
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {kind === 'pdf' && blobUrl && (
                <iframe
                  src={blobUrl}
                  title={attachment.originalName}
                  className="h-full w-full border-0 bg-white"
                />
              )}
              {kind === 'text' && textContent !== null && (
                <pre className="m-0 h-full overflow-auto whitespace-pre-wrap break-words bg-[var(--color-bg)] p-5 text-xs leading-relaxed text-[var(--color-fg)]">
                  {textContent}
                </pre>
              )}
              {kind === 'docx' && docxHtml !== null && (
                <div className="docx-preview h-full overflow-auto bg-white px-8 py-6 text-[14px] leading-relaxed text-[#111]">
                  <div dangerouslySetInnerHTML={{ __html: docxHtml }} />
                </div>
              )}
              {kind === 'xlsx' && xlsxSheets !== null && (
                <div className="xlsx-preview h-full overflow-auto bg-white p-4 text-xs text-[#111]">
                  {xlsxSheets.map((sheet) => (
                    <details key={sheet.name} open className="mb-3 rounded border border-[#e5e7eb]">
                      <summary className="cursor-pointer bg-[#f3f4f6] px-3 py-1.5 text-xs font-semibold text-fg-subtle">
                        {sheet.name}
                      </summary>
                      <div
                        className="overflow-auto p-2 [&_table]:border-collapse [&_td]:border [&_td]:border-[#e5e7eb] [&_td]:px-2 [&_td]:py-1"
                        dangerouslySetInnerHTML={{ __html: sheet.html }}
                      />
                    </details>
                  ))}
                </div>
              )}
              {kind === 'hwp' && (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <FileWarning className="h-10 w-10 text-amber-400" />
                  <p className="text-sm font-semibold text-[var(--color-fg)]">
                    한글(HWP/HWPX) 파일은 미리보기를 지원하지 않습니다
                  </p>
                  <p className="max-w-md text-xs leading-relaxed text-[var(--color-fg-muted)]">
                    파일을 다운로드해 한글 프로그램으로 열거나, 채팅에서 이 파일에 대해
                    질문해 주세요. 현재 에이전트는 HWP 원문 내용을 직접 추출하지 못하므로,
                    파일명·메일 본문 등 주변 맥락을 기반으로 답변합니다.
                  </p>
                </div>
              )}
              {kind === 'unsupported' && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--color-fg-muted)]">
                  이 형식은 미리보기를 제공하지 않습니다. 우측 상단에서 다운로드해 주세요.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
