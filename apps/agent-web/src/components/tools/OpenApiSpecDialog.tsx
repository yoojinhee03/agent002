'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Copy, Download, X, Check, Globe, Code, FileCode, CheckSquare, Square, ChevronLeft } from 'lucide-react'
import type { Tool } from '@agent-studio/shared'
import { useConfirm } from '@/components/shared/confirm-dialog'

interface Props {
  projectId: string
  groupId: string
  mode: 'import' | 'export'
  onClose: () => void
  onImported: (tools: Tool[], mode: 'update' | 'reset') => void
}

export function OpenApiSpecDialog({ projectId, groupId, mode, onClose, onImported }: Props) {
  const [format, setFormat] = useState<'json' | 'yaml'>('json')
  const [importMode, setImportMode] = useState<'text' | 'url'>('text')
  const [spec, setSpec] = useState('')
  const [url, setUrl] = useState('')
  const [baseUrlOverride, setBaseUrlOverride] = useState('')
  const [exportContent, setExportContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  // Preview / Selection states
  const [analyzedTools, setAnalyzedTools] = useState<any[] | null>(null)
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set())
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [importModeType, setImportModeType] = useState<'update' | 'reset'>('update')
  const confirm = useConfirm()

  // Load export content
  useEffect(() => {
    if (mode === 'export') {
      setLoading(true)
      apiClient.toolGroups.exportOpenApi(groupId, format)
        .then((content) => setExportContent(typeof content === 'string' ? content : JSON.stringify(content, null, 2)))
        .catch(() => setError('스펙 내보내기에 실패했습니다.'))
        .finally(() => setLoading(false))
    }
  }, [groupId, mode, format])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError('')
    try {
      const override = baseUrlOverride.trim() || undefined
      
      // Fetch existing tools to compare slugs
      const existingTools = await apiClient.toolGroups.listTools(groupId)
      const slugs = new Set(existingTools.map(t => t.slug))
      setExistingSlugs(slugs)

      let tools: any[]
      if (importMode === 'url') {
        if (!url.trim()) { setError('URL을 입력하세요.'); setAnalyzing(false); return }
        tools = await apiClient.toolGroups.analyzeOpenApiByUrl(groupId, url, override)
      } else {
        if (!spec.trim()) { setError('스펙을 입력하세요.'); setAnalyzing(false); return }
        tools = await apiClient.toolGroups.analyzeOpenApi(groupId, spec, format, override)
      }
      setAnalyzedTools(tools)
      setSelectedIndices(new Set(tools.map((_, i) => i))) // Default select all
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석에 실패했습니다.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleFinalImport = async () => {
    if (!analyzedTools) return
    const toolsToImport = analyzedTools.filter((_, i) => selectedIndices.has(i))
    if (toolsToImport.length === 0) { setError('등록할 도구를 선택하세요.'); return }

    if (importModeType === 'reset') {
      const ok = await confirm({
        title: '도구 일괄 재등록',
        message: '현재 그룹의 모든 도구가 삭제되고 선택한 도구들이 새로 등록됩니다. 계속하시겠습니까?',
        variant: 'danger',
        confirmText: '재등록',
      })
      if (!ok) return
    }

    setImporting(true)
    setError('')
    try {
      const imported = await apiClient.toolGroups.batchImportTools(projectId, groupId, toolsToImport, importModeType)
      onImported(imported, importModeType)
    } catch (err) {
      setError(err instanceof Error ? err.message : '도구 등록에 실패했습니다.')
    } finally {
      setImporting(false)
    }
  }

  const toggleSelect = (i: number) => {
    const next = new Set(selectedIndices)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelectedIndices(next)
  }

  const toggleAll = () => {
    if (analyzedTools && selectedIndices.size === analyzedTools.length) {
      setSelectedIndices(new Set())
    } else if (analyzedTools) {
      setSelectedIndices(new Set(analyzedTools.map((_, i) => i)))
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(exportContent)
  }

  const handleDownload = () => {
    const blob = new Blob([exportContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openapi.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const allSelected = analyzedTools && selectedIndices.size === analyzedTools.length && analyzedTools.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            {analyzedTools && (
              <button onClick={() => setAnalyzedTools(null)} className="p-1 hover:bg-[var(--color-surface-2)] rounded transition-colors mr-1">
                <ChevronLeft className="h-4 w-4 text-[var(--color-fg-subtle)]" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">
              {mode === 'import' ? (analyzedTools ? '도구 선택' : 'OpenAPI 스펙 분석') : 'OpenAPI 스펙 보기'}
            </h2>
          </div>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] text-lg leading-none">×</button>
        </div>

        {mode === 'import' && !analyzedTools && (
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="flex bg-bg p-1 rounded-lg border border-[var(--color-border)]">
              {(['text', 'url'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setImportMode(m)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-all capitalize',
                    importMode === m ? 'bg-blue-600 text-white shadow-sm' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                  )}
                >
                  {m === 'text' ? '스펙 입력' : 'URL 연동'}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              {importMode === 'text' && (
                <>
                  <span className="text-xs text-[var(--color-fg-subtle)]">형식:</span>
                  {(['json', 'yaml'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                        format === f ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                      )}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden p-5 pt-3">
          {mode === 'export' ? (
            loading ? (
              <div className="flex items-center justify-center h-40 text-sm text-[var(--color-fg-subtle)]">로딩 중...</div>
            ) : (
              <div className="relative">
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <button onClick={handleCopy} className="p-1.5 rounded bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors" title="복사">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={handleDownload} className="p-1.5 rounded bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors" title="다운로드">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
                <pre className="w-full h-80 overflow-auto rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2.5 text-xs font-mono text-[var(--color-fg)] whitespace-pre">
                  {exportContent}
                </pre>
              </div>
            )
          ) : analyzedTools ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <button 
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-blue-500" /> : <Square className="h-3.5 w-3.5" />}
                  전체 {analyzedTools.length}개 선택
                </button>
                <span className="text-xs text-[var(--color-fg-subtle)]">{selectedIndices.size}개 선택됨</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                {analyzedTools.map((tool, i) => {
                  const isExisting = existingSlugs.has(tool.slug)
                  const isSelected = selectedIndices.has(i)
                  
                  return (
                    <div 
                      key={i}
                      onClick={() => toggleSelect(i)}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group',
                        isSelected 
                          ? (isExisting ? 'bg-amber-500/5 border-amber-500/40' : 'bg-blue-500/5 border-blue-500/40')
                          : (isExisting ? 'bg-bg/40 border-amber-500/20 hover:border-amber-500/30' : 'bg-bg/40 border-[var(--color-border)] hover:border-[var(--color-border-strong)]')
                      )}
                    >
                      <div className={cn(
                        'shrink-0 p-1 rounded',
                        isSelected 
                          ? (isExisting ? 'text-amber-500' : 'text-blue-500') 
                          : 'text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-subtle)]'
                      )}>
                        {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn(
                            'text-xs font-bold px-1.5 py-0.5 rounded leading-none',
                            tool.config.method === 'GET' ? 'bg-green-500/20 text-green-400' :
                            tool.config.method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-amber-500/20 text-amber-400'
                          )}>
                            {tool.config.method}
                          </span>
                          <h4 className="text-xs font-medium text-[var(--color-fg)] truncate">{tool.name}</h4>
                        </div>
                        <p className="text-xs text-[var(--color-fg-subtle)] font-mono truncate">{tool.config.url.split('/').pop() === '' ? tool.config.url : '/' + tool.config.url.split('/').slice(3).join('/')}</p>
                      </div>
                      
                      <div className="text-xs text-[var(--color-fg-subtle)] font-mono group-hover:text-[var(--color-fg-subtle)] flex items-center gap-2">
                        {isExisting && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/20 shadow-sm">기존</span>
                        )}
                        {!isExisting && isSelected && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-xs font-bold border border-blue-500/20 shadow-sm">신규</span>
                        )}
                        {tool.slug}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : importMode === 'url' ? (
            <div className="space-y-4 py-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-400 leading-relaxed">
                  OpenAPI(Swagger) JSON/YAML 파일의 <strong>직접 접근 가능한 URL</strong>을 입력하세요.<br />
                  예: https://petstore.swagger.io/v2/swagger.json
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
                  OpenAPI Spec URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/openapi.json"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
                  OpenAPI 스펙 붙여넣기
                </label>
                <textarea
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  rows={14}
                  placeholder={format === 'json' ? '{"openapi":"3.0.0","paths":{...}}' : 'openapi: "3.0.0"\npaths:\n  /endpoint:\n    get:\n      ...'}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none resize-none"
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-4 bg-bg/50 rounded-b-xl">
          {mode === 'import' && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <label className="block text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wider">
                  Base URL 오버라이드 (선택 사항)
                </label>
                <input
                  type="text"
                  value={baseUrlOverride}
                  onChange={(e) => setBaseUrlOverride(e.target.value)}
                  placeholder="스펙의 서버 주소를 무시하고 이 주소를 사용"
                  className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                />
              </div>
              
              {analyzedTools && (
                <div className="flex bg-bg p-1 rounded-lg border border-[var(--color-border)] shrink-0">
                  <button
                    onClick={() => setImportModeType('update')}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      importModeType === 'update' ? 'bg-blue-600 text-white shadow-sm' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                    )}
                    title="동일한 슬러그를 가진 도구만 교체합니다."
                  >
                    부분 교체
                  </button>
                  <button
                    onClick={() => setImportModeType('reset')}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      importModeType === 'reset' ? 'bg-red-600 text-white shadow-sm' : 'text-[var(--color-fg-subtle)] hover:text-red-400',
                    )}
                    title="그룹 내 모든 도구를 삭제하고 새로 등록합니다."
                  >
                    전체 교체
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] rounded-lg border border-[var(--color-border)] transition-colors"
            >
              닫기
            </button>
            {mode === 'import' && (
              analyzedTools ? (
                <button
                  onClick={handleFinalImport}
                  disabled={importing || selectedIndices.size === 0}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {importing ? '등록 중...' : `선택한 ${selectedIndices.size}개 도구 등록`}
                </button>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {analyzing ? '스펙 분석 중...' : '스펙 분석하기'}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
