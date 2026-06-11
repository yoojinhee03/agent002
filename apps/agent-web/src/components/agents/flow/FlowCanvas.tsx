'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeMouseHandler,
  type OnNodeDrag,
  type ColorMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Agent } from '@agent-studio/shared'
import { MainAgentNode } from './MainAgentNode'
import { SubAgentNode } from './SubAgentNode'
import { DeletableEdge } from './DeletableEdge'
import { Plus } from 'lucide-react'

const nodeTypes = {
  mainAgent: MainAgentNode,
  subAgent: SubAgentNode,
}

const edgeTypes = {
  deletable: DeletableEdge,
}

const defaultEdgeOptions = {
  type: 'deletable' as const,
}

const deleteKeyCode = ['Backspace', 'Delete']

interface FlowCanvasProps {
  agent: Agent
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  /** 드래그 중 다른 노드와 충돌하면 옆으로 밀어내는 회피 핸들러. */
  onNodeDrag?: OnNodeDrag
  onNodeSelect: (nodeId: string | null) => void
  onAddSubAgent: () => void
  isSupervisor: boolean
  isRunning: boolean
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDrag,
  onNodeSelect,
  onAddSubAgent,
  isRunning,
}: FlowCanvasProps) {
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onNodeSelect(node.id)
    },
    [onNodeSelect],
  )

  const handlePaneClick = useCallback(() => {
    if (isRunning) return
    onNodeSelect(null)
  }, [onNodeSelect, isRunning])

  const [colorMode, setColorMode] = useState<ColorMode>('dark')
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setColorMode(root.classList.contains('light') ? 'light' : 'dark')
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  return (
    <div className="relative h-full w-full bg-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={deleteKeyCode}
        minZoom={0.35}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode={colorMode}
        panActivationKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* 하단 중앙 플로팅: Sub Agent 추가 버튼 */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={onAddSubAgent}
          className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#3B82F6]/40 bg-bg px-4 py-2.5 text-xs font-semibold text-[#3B82F6] shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all hover:border-[#3B82F6]/70 hover:shadow-[0_0_24px_rgba(59,130,246,0.25)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Sub Agent 추가
        </button>
      </div>
    </div>
  )
}
