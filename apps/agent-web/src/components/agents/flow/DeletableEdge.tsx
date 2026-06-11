'use client'

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { X } from 'lucide-react'

interface DeletableEdgeData extends Record<string, unknown> {
  onDelete?: (edgeId: string) => void
}

function DeletableEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  animated,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onDelete = (data as DeletableEdgeData | undefined)?.onDelete

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        className={animated ? 'react-flow__edge-path animated' : undefined}
      />
      <EdgeLabelRenderer>
        <div
          className="group/edge pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {/* 호버 감지용 넉넉한 hitbox — 시각 X 는 그 위에 얹는다. */}
          <div className="relative flex h-6 w-6 items-center justify-center">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(id)
                }}
                title="연결 삭제"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg text-fg-muted opacity-0 shadow-md transition-opacity hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 group-hover/edge:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const DeletableEdge = memo(DeletableEdgeComponent)
