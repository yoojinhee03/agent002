'use client'

import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes/node-types'
import { NodeType } from '@agent-studio/shared'

interface WorkflowCanvasProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onNodesChange?: (nodes: Node[]) => void
  onEdgesChange?: (edges: Edge[]) => void
  readonly?: boolean
}

export function WorkflowCanvas({
  initialNodes = [],
  initialEdges = [],
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  readonly = false,
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge(connection, eds)
        onEdgesChangeProp?.(next)
        return next
      })
    },
    [setEdges, onEdgesChangeProp],
  )

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      // 변경 후 최신 노드 전달 (다음 렌더에서 반영되므로 setTimeout)
      setTimeout(() => onNodesChangeProp?.(nodes), 0)
    },
    [onNodesChange, onNodesChangeProp, nodes],
  )

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={!readonly}
        className="bg-muted/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const type = (node.data?.nodeType ?? node.type) as NodeType
            const colors: Record<string, string> = {
              llm: '#a855f7',
              tool: '#3b82f6',
              condition: '#f59e0b',
              transform: '#14b8a6',
              human_input: '#f97316',
              start: '#22c55e',
              end: '#ef4444',
            }
            return colors[type] ?? 'var(--color-fg-subtle)'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  )
}
