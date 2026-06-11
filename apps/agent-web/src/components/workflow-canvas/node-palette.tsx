'use client'

import { DragEvent } from 'react'
import { cn } from '@/lib/utils'

const NODE_PALETTE = [
  { type: 'llm',         label: 'LLM',          icon: '🤖', color: 'border-purple-400', desc: 'AI 모델 호출' },
  { type: 'tool',        label: 'Tool',          icon: '🔧', color: 'border-blue-400',   desc: '외부 도구 실행' },
  { type: 'condition',   label: 'Condition',     icon: '🔀', color: 'border-amber-400',  desc: '조건 분기' },
  { type: 'transform',   label: 'Transform',     icon: '⚙️', color: 'border-teal-400',   desc: '데이터 변환' },
  { type: 'human_input', label: 'Human Input',   icon: '🙋', color: 'border-orange-400', desc: '사람 개입' },
]

interface NodePaletteProps {
  className?: string
}

export function NodePalette({ className }: NodePaletteProps) {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className={cn('flex flex-col gap-1 p-3', className)}>
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">노드 추가</p>
      {NODE_PALETTE.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md border-2 bg-card cursor-grab',
            'hover:shadow-sm active:cursor-grabbing select-none transition-shadow',
            item.color,
          )}
        >
          <span className="text-base">{item.icon}</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium">{item.label}</span>
            <span className="text-xs text-muted-foreground truncate">{item.desc}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
