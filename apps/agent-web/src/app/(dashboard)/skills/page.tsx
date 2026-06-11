'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type { Skill, SkillFile } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useConfirmHelpers } from '@/components/shared/confirm-dialog'
import { ResizeHandle } from '@/components/agents/flow/ResizeHandle'
import { SkillInstructionsEditor } from '@/components/skills/SkillInstructionsEditor'
import { SkillAssistantPanel } from '@/components/skills/assistant/SkillAssistantPanel'
import type {
  SkillProposalPayload,
  SkillEditPayload,
} from '@/stores/use-skill-assistant-store'
import {
  Sparkles,
  Plus,
  Loader2,
  Trash2,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Upload,
  Download,
  AlertTriangle,
  Search,

} from 'lucide-react'

import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'


const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const SKILL_EXPORT_TYPE = 'agentstudio.skill'
const SKILL_EXPORT_VERSION = 1

function downloadSkill(skill: Skill) {
  const payload = {
    type: SKILL_EXPORT_TYPE,
    version: SKILL_EXPORT_VERSION,
    skill: {
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      allowedTools: skill.allowedTools,
      enabled: skill.enabled,
      files: skill.files.map((f) => ({ path: f.path, content: f.content })),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${skill.name.replace(/[^\w.-]+/g, '_') || 'skill'}.skill.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function getInstructionsPreview(instructions: string): string {
  for (const line of instructions.split('\n')) {
    const stripped = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim()
    if (stripped) return stripped
  }
  return ''
}

function formatRelativeDate(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  if (days < 365) return `${Math.floor(days / 30)}달 전`
  return `${Math.floor(days / 365)}년 전`
}

function getLang(path: string): string {
  const ext = path.split('.').pop() ?? ''
  const map: Record<string, string> = {
    py: 'python',
    ts: 'typescript',
    js: 'javascript',
    md: 'markdown',
    json: 'json',
    sh: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    html: 'html',
    css: 'css',
    xml: 'xml',
  }
  return map[ext] ?? 'plaintext'
}

type SkillFormData = {
  name: string
  description: string
  instructions: string
  allowedTools: string[]
}

const EMPTY_FORM: SkillFormData = {
  name: '',
  description: '',
  instructions: '',
  allowedTools: [],
}

type FileEditState = {
  path: string
  content: string
}

type ToolSuggestion = {
  key: string
  label: string
  enabled: boolean
  source: 'custom' | 'builtin' | 'mcp'
}

function sanitizeToolName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : name
}

const PANEL_WIDTH_KEY = 'skills.panel-width'
const PANEL_WIDTH_MIN = 420
const PANEL_WIDTH_MAX = 1100
const PANEL_WIDTH_DEFAULT = 680

function clampPanelWidth(v: number): number {
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, v))
}

function readStoredPanelWidth(): number {
  if (typeof window === 'undefined') return PANEL_WIDTH_DEFAULT
  try {
    const v = window.localStorage.getItem(PANEL_WIDTH_KEY)
    if (v) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return clampPanelWidth(n)
    }
  } catch {
    /* noop */
  }
  return PANEL_WIDTH_DEFAULT
}

function toolSourceBadgeCls(source: 'custom' | 'builtin' | 'mcp' | 'unknown') {
  if (source === 'builtin') return 'bg-purple-600/15 text-purple-300'
  if (source === 'mcp') return 'bg-emerald-600/15 text-emerald-300'
  if (source === 'custom') return 'bg-blue-600/15 text-blue-300'
  return 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
}

export default function SkillsPage() {
  const activeProjectId = useUserStore((s) => s.activeProjectId)
  const { confirmDelete } = useConfirmHelpers()

  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  const [panelOpen, setPanelOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  // 슬라이드 패널 open/close 토글 직후 300ms 동안만 어시스턴트 marginRight 에 transition 적용.
  // 사용자가 패널을 좌우로 resize 하는 중에는 transition 이 없어야 핸들과 어시스턴트 폭이 동기화된다.
  const [assistantWidthTransition, setAssistantWidthTransition] = useState(false)
  useEffect(() => {
    setAssistantWidthTransition(true)
    const t = window.setTimeout(() => setAssistantWidthTransition(false), 320)
    return () => window.clearTimeout(t)
  }, [panelOpen])

  const [form, setForm] = useState<SkillFormData>(EMPTY_FORM)
  const [toolInput, setToolInput] = useState('')

  const [toolSuggestions, setToolSuggestions] = useState<ToolSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1)

  const [fileEditIndex, setFileEditIndex] = useState<number | null>(null)
  const [fileEditState, setFileEditState] = useState<FileEditState>({ path: '', content: '' })
  const [addingFile, setAddingFile] = useState(false)
  const [newFile, setNewFile] = useState<FileEditState>({ path: '', content: '' })
  const [uploadingSaving, setUploadingSaving] = useState(false)

  const [panelWidth, setPanelWidth] = useState<number>(() => readStoredPanelWidth())
  const panelHydratedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!panelHydratedRef.current) {
      setPanelWidth(readStoredPanelWidth())
      panelHydratedRef.current = true
    }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!panelHydratedRef.current) return
    window.localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth))
  }, [panelWidth])
  const handlePanelResize = useCallback((delta: number) => {
    setPanelWidth((w) => clampPanelWidth(w - delta))
  }, [])

  const toolInputRef = useRef<HTMLInputElement>(null)
  const fileUploadRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const suggestionsBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveSkillMutation = useApiMutation({
    mutationFn: () => {
      if (editingSkill) {
        return apiClient.skills.update(editingSkill.id, {
          name: form.name,
          description: form.description,
          instructions: form.instructions,
          allowedTools: form.allowedTools,
        })
      }
      return apiClient.skills.create({
        name: form.name,
        description: form.description,
        instructions: form.instructions,
        allowedTools: form.allowedTools,
        enabled: true,
      })
    },
    successMessage: editingSkill ? MSG.tool.updated : MSG.tool.created,
    onSuccess: (saved) => {
      if (editingSkill) {
        setSkills(prev => prev.map(s => (s.id === saved.id ? saved : s)))
      } else {
        setSkills(prev => [saved, ...prev])
      }
      closePanel()
    },
  })

  const deleteSkillMutation = useApiMutation({
    mutationFn: (skill: Skill) => apiClient.skills.delete(skill.id),
    successMessage: MSG.tool.deleted,
    onSuccess: (_result, skill) => {
      setSkills(prev => prev.filter(s => s.id !== skill.id))
    },
  })

  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const [assistantHeight, setAssistantHeight] = useState(320)
  const [assistantPrevHeight, setAssistantPrevHeight] = useState<number | null>(null)
  const rootContainerRef = useRef<HTMLDivElement | null>(null)
  // 어시스턴트가 차지할 수 있는 최대 높이 — 루트 컨테이너 전체 높이에서 헤더(콘텐츠 최소 40px) 만 남기고 사용.
  const getAssistantMaxHeight = () => {
    const root = rootContainerRef.current
    if (root) return Math.max(220, root.clientHeight - 40)
    return typeof window !== 'undefined' ? Math.max(220, window.innerHeight - 120) : 640
  }
  const handleAssistantResize = useCallback((delta: number) => {
    setAssistantPrevHeight(null)
    setAssistantHeight((h) => {
      const root = rootContainerRef.current
      const maxH = root
        ? Math.max(220, root.clientHeight - 40)
        : typeof window !== 'undefined'
          ? Math.max(220, window.innerHeight - 120)
          : 640
      return Math.max(220, Math.min(maxH, h - delta))
    })
  }, [])
  const handleAssistantToggleMaximize = useCallback(() => {
    if (assistantPrevHeight != null) {
      setAssistantHeight(assistantPrevHeight)
      setAssistantPrevHeight(null)
    } else {
      setAssistantPrevHeight(assistantHeight)
      setAssistantHeight(getAssistantMaxHeight())
    }
    setAssistantExpanded(true)
  }, [assistantPrevHeight, assistantHeight])
  const handleAssistantToggleExpanded = useCallback(() => {
    setAssistantExpanded((prev) => {
      const next = !prev
      if (next && panelOpen) {
        setAssistantPrevHeight(assistantHeight)
        setAssistantHeight(getAssistantMaxHeight())
      }
      return next
    })
  }, [panelOpen, assistantHeight])
  const assistantIsMaximized = assistantPrevHeight != null
  const assistantTargetSkill = editingSkill
    ? {
        id: editingSkill.id,
        name: editingSkill.name,
        description: editingSkill.description,
        instructions: editingSkill.instructions,
        allowedTools: editingSkill.allowedTools,
        files: editingSkill.files.map((f) => ({ path: f.path, content: f.content })),
      }
    : null

  const openAssistantForAnalysis = (skill: Skill) => {
    useSkillAssistantStore.getState().setMode('analyze')
    setAssistantExpanded(true)
    setEditingSkill(skill)
  }

  const assistantCreateMutation = useApiMutation({
    mutationFn: async (payload: SkillProposalPayload) => {
      const created = await apiClient.skills.create({
        name: payload.name,
        description: payload.description,
        instructions: payload.instructions,
        allowedTools: payload.allowedTools,
        enabled: true,
      })
      for (const f of payload.files || []) {
        try {
          await apiClient.skills.addFile(created.id, { path: f.path, content: f.content })
        } catch (e) {
          // 부분 실패는 사용자에게 한 번만 안내
          console.warn('skill file add failed', f.path, e)
        }
      }
      return apiClient.skills.get(created.id)
    },
    successMessage: MSG.skill.applyProposal,
    onSuccess: (saved) => {
      setSkills(prev => [saved, ...prev])
    },
  })

  const assistantEditMutation = useApiMutation({
    mutationFn: async (args: { targetSkillId: string; payload: SkillEditPayload }) => {
      const { targetSkillId, payload } = args
      const patch: Partial<{
        name: string
        description: string
        instructions: string
        allowedTools: string[]
      }> = {}
      if (payload.name !== undefined) patch.name = payload.name
      if (payload.description !== undefined) patch.description = payload.description
      if (payload.instructions !== undefined) patch.instructions = payload.instructions
      if (payload.allowedTools !== undefined) patch.allowedTools = payload.allowedTools
      let updated: Skill | null = null
      if (Object.keys(patch).length > 0) {
        updated = await apiClient.skills.update(targetSkillId, patch)
      }
      for (const f of payload.addFiles || []) {
        try {
          await apiClient.skills.addFile(targetSkillId, { path: f.path, content: f.content })
        } catch (e) {
          console.warn('skill file add failed', f.path, e)
        }
      }
      if (payload.removeFilePaths?.length) {
        const fresh = await apiClient.skills.get(targetSkillId)
        for (const path of payload.removeFilePaths) {
          const file = fresh.files.find((x) => x.path === path)
          if (file) {
            try {
              await apiClient.skills.deleteFile(targetSkillId, file.id)
            } catch (e) {
              console.warn('skill file delete failed', path, e)
            }
          }
        }
      }
      return apiClient.skills.get(targetSkillId)
    },
    successMessage: MSG.skill.applyEdit,
    onSuccess: (saved) => {
      setSkills(prev => prev.map(s => (s.id === saved.id ? saved : s)))
      if (editingSkill && editingSkill.id === saved.id) {
        setEditingSkill(saved)
        setForm({
          name: saved.name,
          description: saved.description,
          instructions: saved.instructions,
          allowedTools: saved.allowedTools,
        })
      }
    },
  })

  const saveFileMutation = useApiMutation({
    mutationFn: ({ fileId, path, content }: { fileId: string; path: string; content: string }) => {
      if (!editingSkill) throw new Error('편집 중인 Skill이 없습니다')
      return apiClient.skills.updateFile(editingSkill.id, fileId, { path, content })
    },
    successMessage: '파일이 저장되었습니다',
    onSuccess: (updated) => {
      if (!editingSkill) return
      const newFiles = editingSkill.files.map(f => (f.id === updated.id ? updated : f))
      const updatedSkill = { ...editingSkill, files: newFiles }
      setEditingSkill(updatedSkill)
      setSkills(prev => prev.map(s => (s.id === updatedSkill.id ? updatedSkill : s)))
      setFileEditIndex(null)
      setFileEditState({ path: '', content: '' })
    },
  })

  const addFileMutation = useApiMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => {
      if (!editingSkill) throw new Error('편집 중인 Skill이 없습니다')
      return apiClient.skills.addFile(editingSkill.id, { path, content })
    },
    successMessage: '파일이 추가되었습니다',
    onSuccess: (created) => {
      if (!editingSkill) return
      const updatedSkill = { ...editingSkill, files: [...editingSkill.files, created] }
      setEditingSkill(updatedSkill)
      setSkills(prev => prev.map(s => (s.id === updatedSkill.id ? updatedSkill : s)))
      setAddingFile(false)
      setNewFile({ path: '', content: '' })
    },
  })

  const deleteFileMutation = useApiMutation({
    mutationFn: (file: SkillFile) => {
      if (!editingSkill) throw new Error('편집 중인 Skill이 없습니다')
      return apiClient.skills.deleteFile(editingSkill.id, file.id)
    },
    successMessage: '파일이 삭제되었습니다',
    onSuccess: (_result, file) => {
      if (!editingSkill) return
      const newFiles = editingSkill.files.filter(f => f.id !== file.id)
      const updatedSkill = { ...editingSkill, files: newFiles }
      setEditingSkill(updatedSkill)
      setSkills(prev => prev.map(s => (s.id === updatedSkill.id ? updatedSkill : s)))
      if (fileEditIndex !== null && editingSkill.files[fileEditIndex]?.id === file.id) {
        setFileEditIndex(null)
      }
    },
  })

  useEffect(() => {
    setLoading(true)
    apiClient.skills
      .list()
      .then(setSkills)
      .catch(() => toast.error('Skills 목록을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeProjectId) return
    Promise.all([
      apiClient.tools.list(activeProjectId),
      apiClient.tools.getBuiltin(activeProjectId),
      apiClient.mcp.listAllTools(activeProjectId, { onlyExposed: true }).catch(() => []),
    ])
      .then(([customTools, builtinGroups, mcpGroups]) => {
        const custom: ToolSuggestion[] = customTools.map((t) => ({
          key: t.slug,
          label: t.name,
          enabled: t.enabled,
          source: 'custom',
        }))
        const builtin: ToolSuggestion[] = builtinGroups.flatMap((g) =>
          g.tools.map((t) => ({
            key: t.id,
            label: t.name,
            enabled: t.enabled,
            source: 'builtin',
          })),
        )
        const mcp: ToolSuggestion[] = mcpGroups.flatMap((g) =>
          g.tools.map((t) => ({
            key: sanitizeToolName(t.name),
            label: `${g.serverName} · ${t.name}`,
            enabled: true,
            source: 'mcp',
          })),
        )
        setToolSuggestions([...custom, ...builtin, ...mcp])
      })
      .catch(() => {})
  }, [activeProjectId])

  const q = toolInput.toLowerCase().trim()
  const visibleSuggestions = toolSuggestions
    .filter(
      (s) =>
        !form.allowedTools.includes(s.key) &&
        (!q || s.key.includes(q) || s.label.toLowerCase().includes(q)),
    )
    .slice(0, 12)
  const enabledSuggestions = visibleSuggestions.filter((s) => s.enabled)
  const disabledSuggestions = visibleSuggestions.filter((s) => !s.enabled)

  type ToolStatus = 'active' | 'disabled' | 'orphan'
  function getToolStatus(toolKey: string): ToolStatus {
    const s = toolSuggestions.find((s) => s.key === toolKey)
    if (!s) return 'orphan'
    return s.enabled ? 'active' : 'disabled'
  }
  function getToolSource(toolKey: string): 'custom' | 'builtin' | 'mcp' | 'unknown' {
    const s = toolSuggestions.find((s) => s.key === toolKey)
    return s?.source ?? 'unknown'
  }
  function toolBadgeCls(status: ToolStatus, toolKey?: string) {
    if (status === 'active') {
      if (!toolKey) return 'bg-blue-600/20 text-blue-300'
      return toolSourceBadgeCls(getToolSource(toolKey))
    }
    if (status === 'disabled') return 'bg-amber-500/20 text-amber-300'
    return 'bg-red-500/20 text-red-400'
  }

  function openCreate() {
    setEditingSkill(null)
    setForm(EMPTY_FORM)
    setToolInput('')
    setFileEditIndex(null)
    setAddingFile(false)
    setNewFile({ path: '', content: '' })
    setPanelOpen(true)
  }

  function openEdit(skill: Skill) {
    setEditingSkill(skill)
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      allowedTools: [...skill.allowedTools],
    })
    setToolInput('')
    setFileEditIndex(null)
    setAddingFile(false)
    setNewFile({ path: '', content: '' })
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setEditingSkill(null)
    setForm(EMPTY_FORM)
    setToolInput('')
    setSelectedSuggestionIdx(-1)
    setFileEditIndex(null)
    setAddingFile(false)
    setNewFile({ path: '', content: '' })
    setShowSuggestions(false)
  }

  function addTool(raw: string) {
    const trimmed = raw.trim().replace(/,$/, '').trim()
    if (!trimmed) return
    if (form.allowedTools.includes(trimmed)) return
    setForm((prev) => ({ ...prev, allowedTools: [...prev.allowedTools, trimmed] }))
    setToolInput('')
    setSelectedSuggestionIdx(-1)
    setShowSuggestions(false)
  }

  function removeTool(tool: string) {
    setForm((prev) => ({
      ...prev,
      allowedTools: prev.allowedTools.filter((t) => t !== tool),
    }))
  }

  function handleSaveSkill() {
    if (!form.name.trim()) {
      toast.error('이름을 입력해 주세요')
      return
    }
    saveSkillMutation.mutate()
  }

  async function handleDeleteSkill(skill: Skill) {
    if (!(await confirmDelete(`"${skill.name}" Skill을 삭제하시겠습니까?`))) return
    deleteSkillMutation.mutate(skill)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const parsed = JSON.parse(await file.text())
      const data =
        parsed?.type === SKILL_EXPORT_TYPE && parsed?.skill ? parsed.skill : parsed
      if (!data || typeof data.name !== 'string' || !data.name.trim()) {
        toast.error('유효한 Skill 파일이 아닙니다')
        return
      }
      const created = await apiClient.skills.import({
        name: data.name.slice(0, 100),
        description: typeof data.description === 'string' ? data.description : '',
        instructions: typeof data.instructions === 'string' ? data.instructions : '',
        allowedTools: Array.isArray(data.allowedTools)
          ? data.allowedTools.filter((t: unknown): t is string => typeof t === 'string')
          : [],
        enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
        files: Array.isArray(data.files)
          ? data.files
              .filter(
                (f: unknown): f is { path: string; content: string } =>
                  typeof f === 'object' &&
                  f !== null &&
                  typeof (f as { path?: unknown }).path === 'string' &&
                  typeof (f as { content?: unknown }).content === 'string',
              )
              .map((f: { path: string; content: string }) => ({ path: f.path, content: f.content }))
          : [],
      })
      setSkills((prev) => [created, ...prev])
      toast.success(`"${created.name}" Skill을 가져왔습니다`)
    } catch (err) {
      toast.error(
        err instanceof SyntaxError ? 'JSON 파싱에 실패했습니다' : '가져오기에 실패했습니다',
      )
    }
  }

  function startEditFile(index: number) {
    if (!editingSkill) return
    const file = editingSkill.files[index]
    setFileEditState({ path: file.path, content: file.content })
    setFileEditIndex(index)
    setAddingFile(false)
  }

  function cancelEditFile() {
    setFileEditIndex(null)
    setFileEditState({ path: '', content: '' })
  }

  function handleSaveFile() {
    if (!editingSkill || fileEditIndex === null) return
    const file = editingSkill.files[fileEditIndex]
    if (!fileEditState.path.trim()) {
      toast.error('파일 경로를 입력해 주세요')
      return
    }
    saveFileMutation.mutate({ fileId: file.id, path: fileEditState.path, content: fileEditState.content })
  }

  async function handleDeleteFile(file: SkillFile) {
    if (!editingSkill) return
    if (!(await confirmDelete(`"${file.path}" 파일을 삭제하시겠습니까?`))) return
    deleteFileMutation.mutate(file)
  }

  function handleAddFile() {
    if (!editingSkill) return
    if (!newFile.path.trim()) {
      toast.error('파일 경로를 입력해 주세요')
      return
    }
    addFileMutation.mutate({ path: newFile.path, content: newFile.content })
  }

  async function handleUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !editingSkill) return
    e.target.value = ''

    if (files.length === 1) {
      const text = await files[0].text()
      setNewFile({ path: files[0].name, content: text })
      setAddingFile(true)
      setFileEditIndex(null)
      return
    }

    setUploadingSaving(true)
    let success = 0
    for (const file of files) {
      try {
        const text = await file.text()
        const created = await apiClient.skills.addFile(editingSkill.id, {
          path: file.name,
          content: text,
        })
        setEditingSkill((prev) => (prev ? { ...prev, files: [...prev.files, created] } : prev))
        setSkills((prev) =>
          prev.map((s) =>
            s.id === editingSkill.id ? { ...s, files: [...s.files, created] } : s,
          ),
        )
        success++
      } catch {
        toast.error(`"${file.name}" 업로드 실패`)
      }
    }
    setUploadingSaving(false)
    if (success > 0) toast.success(`${success}개 파일이 업로드되었습니다`)
  }

  return (
    <div ref={rootContainerRef} className="relative h-full overflow-hidden bg-[var(--color-bg)] flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-fg)]">Skills</h1>
            <p className="text-xs text-[var(--color-fg-subtle)]">에이전트가 참조할 스킬을 관리합니다</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => importFileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Skill
            </button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            className="hidden"
            accept=".json,application/json"
            onChange={handleImportFile}
          />
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-fg-subtle)]" />
          </div>
        )}

        {/* 빈 상태 */}
        {!loading && skills.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] py-24 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-[var(--color-border-strong)]" />
            <p className="text-sm font-medium text-[var(--color-fg-muted)]">등록된 Skill이 없습니다</p>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              에이전트가 사용할 첫 번째 Skill을 만들어 보세요.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
            >
              <Plus className="h-3.5 w-3.5" />
              첫 번째 Skill 만들기
            </button>
          </div>
        )}

        {/* 스킬 목록 */}
        {!loading && skills.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="truncate text-sm font-semibold text-[var(--color-fg)]">
                      {skill.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openAssistantForAnalysis(skill)}
                      className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-blue-500/10 hover:text-blue-300 transition-colors"
                      title="AI 분석"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => downloadSkill(skill)}
                      className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
                      title="내보내기 (JSON)"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(skill)}
                      className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
                      title="편집"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(skill)}
                      className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {(() => {
                  const preview = skill.description || getInstructionsPreview(skill.instructions)
                  return preview ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
                      {preview}
                    </p>
                  ) : null
                })()}

                {skill.allowedTools.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.allowedTools.slice(0, 4).map((tool) => {
                      const status = getToolStatus(tool)
                      return (
                        <span
                          key={tool}
                          title={
                            status === 'orphan'
                              ? '삭제된 도구'
                              : status === 'disabled'
                              ? '비활성화된 도구'
                              : undefined
                          }
                          className={cn(
                            'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs',
                            status === 'active'
                              ? toolSourceBadgeCls(getToolSource(tool))
                              : status === 'disabled'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-500/15 text-red-400',
                          )}
                        >
                          {status !== 'active' && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                          {tool}
                        </span>
                      )
                    })}
                    {skill.allowedTools.length > 4 && (
                      <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]">
                        +{skill.allowedTools.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    {skill.files.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-fg-subtle)]">
                        <FileCode2 className="h-3 w-3" />
                        {skill.files.length}개 파일
                      </span>
                    )}
                    {skill.instructions && (
                      <span className="text-xs text-[var(--color-fg-subtle)]">SKILL.md ✓</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-fg-subtle)]">
                    {formatRelativeDate(skill.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginRight: panelOpen ? `${panelWidth}px` : 0,
          position: 'relative',
          zIndex: panelOpen ? 45 : 'auto',
          transition: assistantWidthTransition ? 'margin-right 300ms' : 'none',
        }}
      >
        <SkillAssistantPanel
          expanded={assistantExpanded}
          onToggleExpanded={handleAssistantToggleExpanded}
          height={assistantHeight}
          onResize={handleAssistantResize}
          targetSkill={assistantTargetSkill}
          onApplyProposal={async (payload) => {
            await assistantCreateMutation.mutateAsync(payload)
          }}
          onApplyEdit={async (targetSkillId, payload) => {
            await assistantEditMutation.mutateAsync({ targetSkillId, payload })
          }}
          onToggleMaximize={handleAssistantToggleMaximize}
          isMaximized={assistantIsMaximized}
        />
      </div>

      {/* 슬라이드 패널 오버레이 */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={closePanel} />
      )}

      {/* 슬라이드 패널 */}
      <div
        style={{ width: `${panelWidth}px` }}
        className={cn(
          'fixed right-0 top-0 z-50 h-full border-l border-[var(--color-border)] bg-bg transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <ResizeHandle direction="horizontal" edge="left" onResize={handlePanelResize} />
        )}
        <div className="h-full overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-bold text-[var(--color-fg)]">
            {editingSkill ? 'Skill 편집' : 'New Skill'}
          </h2>
          <button
            onClick={closePanel}
            className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
              이름
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="search-web"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                설명
              </label>
              <span className="text-xs text-[var(--color-fg-subtle)]">{form.description.length}/1024</span>
            </div>
            <textarea
              maxLength={1024}
              rows={3}
              placeholder="에이전트가 웹 검색이 필요할 때 사용"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full resize-none rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Allowed Tools */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
              허용 도구
            </label>
            <div className="relative">
              <div
                className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 min-h-[40px] cursor-text"
                onClick={() => toolInputRef.current?.focus()}
              >
                {form.allowedTools.map((tool) => {
                  const status = getToolStatus(tool)
                  return (
                    <span
                      key={tool}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                        toolBadgeCls(status, tool),
                      )}
                    >
                      {status !== 'active' && (
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                      )}
                      {tool}
                      <button
                        onMouseDown={(e) => { e.preventDefault(); removeTool(tool) }}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
                <input
                  ref={toolInputRef}
                  type="text"
                  placeholder={form.allowedTools.length === 0 ? '도구 검색...' : ''}
                  value={toolInput}
                  onChange={(e) => {
                    setToolInput(e.target.value)
                    setSelectedSuggestionIdx(-1)
                    setShowSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setShowSuggestions(true)
                      setSelectedSuggestionIdx((i) =>
                        i < enabledSuggestions.length - 1 ? i + 1 : 0,
                      )
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setShowSuggestions(true)
                      setSelectedSuggestionIdx((i) =>
                        i > 0 ? i - 1 : enabledSuggestions.length - 1,
                      )
                    } else if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      if (selectedSuggestionIdx >= 0 && enabledSuggestions[selectedSuggestionIdx]) {
                        addTool(enabledSuggestions[selectedSuggestionIdx].key)
                      }
                      // Enter without selection: no free-text add (only registered tools)
                    } else if (e.key === 'Escape') {
                      setShowSuggestions(false)
                      setSelectedSuggestionIdx(-1)
                    } else if (e.key === 'Backspace' && toolInput === '') {
                      e.preventDefault()
                      if (form.allowedTools.length > 0) {
                        removeTool(form.allowedTools[form.allowedTools.length - 1])
                      }
                    }
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    suggestionsBlurTimer.current = setTimeout(() => {
                      setShowSuggestions(false)
                      setSelectedSuggestionIdx(-1)
                    }, 150)
                  }}
                  className="min-w-[120px] flex-1 bg-transparent text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] outline-none"
                />
              </div>

              {/* 도구 드롭다운 */}
              {showSuggestions && (enabledSuggestions.length > 0 || disabledSuggestions.length > 0) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                  {enabledSuggestions.length === 0 && !q && toolSuggestions.length === 0 && (
                    <p className="px-3 py-3 text-xs text-[var(--color-fg-subtle)]">등록된 도구가 없습니다</p>
                  )}

                  {/* 활성 도구 */}
                  {enabledSuggestions.map((s, i) => (
                    <button
                      key={s.key}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (suggestionsBlurTimer.current) clearTimeout(suggestionsBlurTimer.current)
                        addTool(s.key)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-left transition-colors',
                        i === selectedSuggestionIdx ? 'bg-blue-600/20' : 'hover:bg-[var(--color-surface-2)]',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                        <span className="text-sm text-[var(--color-fg)]">{s.key}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-[var(--color-fg-subtle)] truncate max-w-[100px]">{s.label}</span>
                        <span className={cn(
                          'rounded px-1 py-0.5 text-xs uppercase tracking-wider',
                          s.source === 'builtin'
                            ? 'bg-purple-600/20 text-purple-300'
                            : s.source === 'mcp'
                            ? 'bg-emerald-600/20 text-emerald-300'
                            : 'bg-[var(--color-border-strong)] text-[var(--color-fg-muted)]',
                        )}>
                          {s.source}
                        </span>
                      </div>
                    </button>
                  ))}

                  {/* 비활성 도구 구분선 */}
                  {disabledSuggestions.length > 0 && (
                    <>
                      {enabledSuggestions.length > 0 && (
                        <div className="mx-3 border-t border-[var(--color-border-strong)] my-1" />
                      )}
                      <p className="px-3 py-1 text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">
                        비활성화된 도구
                      </p>
                      {disabledSuggestions.map((s) => (
                        <div
                          key={s.key}
                          className="flex w-full items-center justify-between px-3 py-2 opacity-40 cursor-not-allowed"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-fg-subtle)]" />
                            <span className="text-sm text-[var(--color-fg-muted)]">{s.key}</span>
                          </div>
                          <span className="text-xs text-[var(--color-fg-subtle)] truncate max-w-[120px]">{s.label}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--color-fg-subtle)]">
              ↑↓ 방향키로 선택 · Enter로 등록 · Backspace로 마지막 항목 제거
            </p>
          </div>

          {/* Instructions (Monaco) */}
          <div className="space-y-1.5">
            <SkillInstructionsEditor
              value={form.instructions}
              onChange={(v) => setForm((prev) => ({ ...prev, instructions: v }))}
            />
          </div>

          {/* Additional Files (편집 모드에서만 표시) */}
          {editingSkill && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  추가 파일
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => fileUploadRef.current?.click()}
                    className="flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    <Upload className="h-3 w-3" />
                    파일 업로드
                  </button>
                  <button
                    onClick={() => {
                      setAddingFile(true)
                      setNewFile({ path: '', content: '' })
                      setFileEditIndex(null)
                    }}
                    className="flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    파일 추가
                  </button>
                </div>
              </div>

              <input
                ref={fileUploadRef}
                type="file"
                className="hidden"
                multiple
                accept=".py,.md,.ts,.js,.json,.yaml,.yml,.sh,.toml,.txt,.csv,.xml,.html,.css"
                onChange={handleUploadFiles}
              />

              {editingSkill.files.length === 0 && !addingFile && (
                <p className="text-xs text-[var(--color-fg-subtle)]">추가된 파일이 없습니다</p>
              )}

              <div className="space-y-1">
                {editingSkill.files.map((file, idx) => (
                  <div key={file.id} className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
                        <span className="truncate text-xs text-[var(--color-fg)]">{file.path}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() =>
                            fileEditIndex === idx ? cancelEditFile() : startEditFile(idx)
                          }
                          className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
                          title={fileEditIndex === idx ? '닫기' : '편집'}
                        >
                          {fileEditIndex === idx ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {fileEditIndex === idx && (
                      <div className="border-t border-[var(--color-border-strong)] px-3 pb-3 pt-2 space-y-2">
                        <input
                          type="text"
                          placeholder="search.py"
                          value={fileEditState.path}
                          onChange={(e) =>
                            setFileEditState((prev) => ({ ...prev, path: e.target.value }))
                          }
                          className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
                        />
                        <div className="overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
                          <MonacoEditor
                            height="200px"
                            language={getLang(fileEditState.path)}
                            theme="vs-dark"
                            value={fileEditState.content}
                            onChange={(val) =>
                              setFileEditState((prev) => ({ ...prev, content: val ?? '' }))
                            }
                            options={{
                              minimap: { enabled: false },
                              fontSize: 12,
                              scrollBeyondLastLine: false,
                              padding: { top: 8, bottom: 8 },
                            }}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={cancelEditFile}
                            className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleSaveFile}
                            disabled={saveFileMutation.isPending || addFileMutation.isPending || uploadingSaving}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            {(saveFileMutation.isPending || addFileMutation.isPending || uploadingSaving) && <Loader2 className="h-3 w-3 animate-spin" />}
                            저장
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 새 파일 추가 폼 */}
              {addingFile && (
                <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 pb-3 pt-3 space-y-2">
                  <input
                    type="text"
                    placeholder="search.py"
                    value={newFile.path}
                    onChange={(e) => setNewFile((prev) => ({ ...prev, path: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
                  />
                  <div className="overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
                    <MonacoEditor
                      height="200px"
                      language={getLang(newFile.path)}
                      theme="vs-dark"
                      value={newFile.content}
                      onChange={(val) => setNewFile((prev) => ({ ...prev, content: val ?? '' }))}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        scrollBeyondLastLine: false,
                        padding: { top: 8, bottom: 8 },
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setAddingFile(false)
                        setNewFile({ path: '', content: '' })
                      }}
                      className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleAddFile}
                      disabled={saveFileMutation.isPending || addFileMutation.isPending || uploadingSaving}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {(saveFileMutation.isPending || addFileMutation.isPending || uploadingSaving) && <Loader2 className="h-3 w-3 animate-spin" />}
                      파일 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {editingSkill === null && (
            <p className="text-xs text-[var(--color-fg-subtle)] rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-2">
              Skill을 저장한 후 추가 파일을 업로드할 수 있습니다.
            </p>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--color-border)] bg-bg px-6 py-4">
          <button
            onClick={closePanel}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSaveSkill}
            disabled={saveSkillMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {saveSkillMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {saveSkillMutation.isPending ? '저장 중...' : 'Skill 저장'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
