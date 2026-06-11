'use client'

import { useMemo } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TreeNode {
  label: string
  detail?: string
  /** payload 텍스트 안에서 이 노드가 시작되는 line/column (1-based). */
  line: number
  column: number
  children: TreeNode[]
}

interface Props {
  payloadText: string
  onJump?: (line: number, column: number) => void
}

interface JsonLocator {
  text: string
}

/**
 * payload JSON 텍스트를 다시 파싱하면서 각 노드의 line/column 을 추적.
 * AC 의 body/actions/items/columns/card 같은 컨테이너 필드를 자동으로 탐색.
 */
function buildTree(text: string): TreeNode[] {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return []
  }
  if (!obj || typeof obj !== 'object') return []
  const root = obj as Record<string, unknown>

  function findPath(target: unknown, pathKeys: string[]): { line: number; column: number } {
    // 단순 fallback — 더 정확한 위치는 별도 JSON parser 필요. 키 경로의 마지막 키를
    // 텍스트에서 찾아 그 라인을 반환. 동명 키가 여럿이면 부정확할 수 있다.
    if (pathKeys.length === 0) return { line: 1, column: 1 }
    const key = pathKeys[pathKeys.length - 1]
    const idx = text.indexOf(`"${key}"`)
    if (idx < 0) return { line: 1, column: 1 }
    const before = text.slice(0, idx)
    const line = before.split('\n').length
    const lastNl = before.lastIndexOf('\n')
    const column = idx - (lastNl + 1) + 1
    return { line, column }
  }

  function elementLabel(el: Record<string, unknown>): { label: string; detail?: string } {
    const type = typeof el.type === 'string' ? el.type : '(unknown)'
    const id = typeof el.id === 'string' ? el.id : undefined
    const title = typeof el.title === 'string' ? el.title : undefined
    const text = typeof el.text === 'string' ? el.text : undefined
    const detail = id ? `#${id}` : title ?? text
    return { label: type, detail: detail ? truncate(detail, 30) : undefined }
  }

  function walkElement(el: unknown, pathKeys: string[]): TreeNode | null {
    if (!el || typeof el !== 'object') return null
    const o = el as Record<string, unknown>
    const { label, detail } = elementLabel(o)
    const { line, column } = findPath(o, pathKeys)
    const children: TreeNode[] = []
    if (Array.isArray(o.items)) {
      for (let i = 0; i < o.items.length; i++) {
        const c = walkElement(o.items[i], [...pathKeys, 'items'])
        if (c) children.push(c)
      }
    }
    if (Array.isArray(o.columns)) {
      for (let i = 0; i < o.columns.length; i++) {
        const c = walkElement(o.columns[i], [...pathKeys, 'columns'])
        if (c) children.push(c)
      }
    }
    if (o.card && typeof o.card === 'object') {
      const sub = walkElement(o.card, [...pathKeys, 'card'])
      if (sub) children.push(sub)
    }
    return { label, detail, line, column, children }
  }

  const groups: TreeNode[] = []
  if (Array.isArray(root.body)) {
    const bodyNode: TreeNode = {
      label: 'body',
      detail: `${root.body.length} elements`,
      ...findPath(null, ['body']),
      children: [],
    }
    for (let i = 0; i < root.body.length; i++) {
      const c = walkElement(root.body[i], ['body'])
      if (c) bodyNode.children.push(c)
    }
    groups.push(bodyNode)
  }
  if (Array.isArray(root.actions)) {
    const actionsNode: TreeNode = {
      label: 'actions',
      detail: `${root.actions.length} actions`,
      ...findPath(null, ['actions']),
      children: [],
    }
    for (let i = 0; i < root.actions.length; i++) {
      const c = walkElement(root.actions[i], ['actions'])
      if (c) actionsNode.children.push(c)
    }
    groups.push(actionsNode)
  }
  return groups
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function PayloadTreeOutliner({ payloadText, onJump }: Props) {
  const tree = useMemo(() => buildTree(payloadText), [payloadText])
  if (tree.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-fg-subtle">
        payload 가 유효하지 않거나 body/actions 가 없습니다
      </div>
    )
  }
  return (
    <div className="overflow-y-auto px-1 py-1 text-[11px]">
      {tree.map((node, i) => (
        <TreeRow key={i} node={node} depth={0} onJump={onJump} />
      ))}
    </div>
  )
}

function TreeRow({
  node,
  depth,
  onJump,
}: {
  node: TreeNode
  depth: number
  onJump?: (line: number, column: number) => void
}) {
  const hasChildren = node.children.length > 0
  return (
    <div>
      <button
        type="button"
        onClick={() => onJump?.(node.line, node.column)}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-blue-500/10',
          depth === 0 && 'mt-1 font-medium text-fg',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        title={`라인 ${node.line} 로 점프`}
      >
        {hasChildren ? (
          <ChevronRight className="h-3 w-3 shrink-0 rotate-90 text-fg-subtle" />
        ) : (
          <Layers className="h-3 w-3 shrink-0 text-fg-subtle" />
        )}
        <span className="font-mono text-[10px] text-blue-300">{node.label}</span>
        {node.detail && (
          <span className="truncate text-[10px] text-fg-subtle">{node.detail}</span>
        )}
        <span className="ml-auto text-[9px] text-fg-subtle">L{node.line}</span>
      </button>
      {hasChildren &&
        node.children.map((c, i) => (
          <TreeRow key={i} node={c} depth={depth + 1} onJump={onJump} />
        ))}
    </div>
  )
}

export type { TreeNode, JsonLocator }
