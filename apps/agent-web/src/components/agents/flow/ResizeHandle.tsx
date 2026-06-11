'use client'

import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  /** 'horizontal' = 좌우 드래그(가로 폭 변경) | 'vertical' = 상하 드래그(세로 높이 변경) */
  direction: 'horizontal' | 'vertical'
  /** 매 mousemove 마다 호출되는 콜백. delta 는 마지막 mousemove 이후의 픽셀 변화량. */
  onResize: (deltaPx: number) => void
  /** 핸들이 부착되는 가장자리. horizontal → left|right, vertical → top|bottom. */
  edge?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}

export function ResizeHandle({
  direction,
  onResize,
  edge,
  className,
}: ResizeHandleProps) {
  const startRef = useRef<number | null>(null)
  const resolvedEdge: 'left' | 'right' | 'top' | 'bottom' =
    edge ?? (direction === 'horizontal' ? 'left' : 'top')

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startRef.current = direction === 'horizontal' ? e.clientX : e.clientY

      const move = (ev: MouseEvent) => {
        if (startRef.current === null) return
        const now = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = now - startRef.current
        startRef.current = now
        onResize(delta)
      }
      const up = () => {
        startRef.current = null
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [direction, onResize],
  )

  return (
    <div
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onMouseDown={onMouseDown}
      className={cn(
        'group absolute z-20 flex items-center justify-center',
        direction === 'horizontal'
          ? cn(
              'top-0 h-full w-2 cursor-col-resize',
              resolvedEdge === 'right' ? '-right-1' : '-left-1',
            )
          : cn(
              'left-0 w-full h-2 cursor-row-resize',
              resolvedEdge === 'bottom' ? '-bottom-1' : '-top-1',
            ),
        className,
      )}
    >
      <div
        className={cn(
          'transition-colors',
          direction === 'horizontal' ? 'h-full w-px' : 'h-px w-full',
          'bg-transparent group-hover:bg-blue-400/70 group-active:bg-blue-400',
        )}
      />
    </div>
  )
}
