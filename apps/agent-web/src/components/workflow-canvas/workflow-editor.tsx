'use client'

import { useCallback, useRef } from 'react'
import {
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react'
import { Loader2 } from 'lucide-react'
import { WorkflowCanvas } from './workflow-canvas'
import { NodePalette } from './node-palette'
import { v4 as uuidv4 } from 'uuid'

interface WorkflowEditorProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave?: (nodes: Node[], edges: Edge[]) => void
  isSaving?: boolean
}

function EditorInner({ initialNodes = [], initialEdges = [], onSave, isSaving = false }: WorkflowEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const nodesRef = useRef<Node[]>(initialNodes)
  const edgesRef = useRef<Edge[]>(initialEdges)

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData('application/reactflow')
      if (!nodeType) return

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      const labelMap: Record<string, string> = {
        llm: 'LLM Node',
        tool: 'Tool Node',
        condition: 'Condition',
        transform: 'Transform',
        human_input: 'Human Input',
      }

      const newNode: Node = {
        id: uuidv4(),
        type: nodeType,
        position,
        data: {
          label: labelMap[nodeType] ?? nodeType,
          nodeType,
          config: {},
        },
      }

      nodesRef.current = [...nodesRef.current, newNode]
    },
    [screenToFlowPosition],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  return (
    <div className="flex h-full">
      {/* 왼쪽 — 노드 팔레트 */}
      <div className="w-52 border-r bg-background flex-shrink-0 overflow-y-auto">
        <NodePalette />
      </div>

      {/* 가운데 — 캔버스 */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 relative"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <WorkflowCanvas
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onNodesChange={(nodes) => { nodesRef.current = nodes }}
          onEdgesChange={(edges) => { edgesRef.current = edges }}
        />

        {/* 저장 버튼 */}
        {onSave && (
          <button
            onClick={() => onSave(nodesRef.current, edgesRef.current)}
            disabled={isSaving}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isSaving ? '저장 중...' : '저장'}
          </button>
        )}
      </div>
    </div>
  )
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
