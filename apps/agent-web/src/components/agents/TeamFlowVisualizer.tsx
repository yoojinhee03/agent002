'use client'

interface FlowMessage {
  from: string
  to: string
  content: string
  timestamp: number
}

interface LaneMember {
  id: string
  name: string
  type: 'agent' | 'team'
}

interface TeamFlowVisualizerProps {
  messages: FlowMessage[]
  members: LaneMember[]
}

const LANE_WIDTH = 160
const LANE_HEADER_H = 40
const ROW_H = 64
const ARROW_OFFSET = 12

export function TeamFlowVisualizer({ messages, members }: TeamFlowVisualizerProps) {
  if (members.length === 0) return null

  const svgWidth = Math.max(members.length * LANE_WIDTH, 320)
  const svgHeight = LANE_HEADER_H + Math.max(messages.length, 1) * ROW_H + 20

  const laneX = (id: string) => {
    const idx = members.findIndex((m) => m.id === id)
    return idx < 0 ? svgWidth / 2 : idx * LANE_WIDTH + LANE_WIDTH / 2
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="block"
        style={{ minWidth: svgWidth }}
      >
        {/* 레인 헤더 */}
        {members.map((m, i) => (
          <g key={m.id}>
            <rect
              x={i * LANE_WIDTH}
              y={0}
              width={LANE_WIDTH}
              height={LANE_HEADER_H}
              fill={m.type === 'team' ? '#1e1b4b' : '#0f172a'}
              rx={4}
            />
            <text
              x={i * LANE_WIDTH + LANE_WIDTH / 2}
              y={LANE_HEADER_H / 2 + 5}
              textAnchor="middle"
              fill="var(--color-fg)"
              fontSize={11}
              fontWeight={600}
            >
              {m.name.length > 14 ? m.name.slice(0, 12) + '…' : m.name}
            </text>
            {/* 레인 구분선 */}
            <line
              x1={i * LANE_WIDTH + LANE_WIDTH / 2}
              y1={LANE_HEADER_H}
              x2={i * LANE_WIDTH + LANE_WIDTH / 2}
              y2={svgHeight}
              stroke="var(--color-surface-2)"
              strokeDasharray="4 4"
            />
          </g>
        ))}

        {/* 메시지 흐름 */}
        {messages.map((msg, idx) => {
          const y = LANE_HEADER_H + idx * ROW_H + ROW_H / 2
          const x1 = laneX(msg.from)
          const x2 = laneX(msg.to)
          const isLeft = x2 < x1
          const arrowX = isLeft ? x2 + ARROW_OFFSET : x2 - ARROW_OFFSET

          return (
            <g key={idx}>
              {/* 연결선 */}
              <line
                x1={x1}
                y1={y}
                x2={arrowX}
                y2={y}
                stroke="#3b82f6"
                strokeWidth={1.5}
                markerEnd={isLeft ? undefined : 'url(#arrowRight)'}
                markerStart={isLeft ? 'url(#arrowLeft)' : undefined}
              />
              {/* 메시지 버블 */}
              <foreignObject
                x={Math.min(x1, x2) + Math.abs(x2 - x1) / 2 - 50}
                y={y - 14}
                width={100}
                height={28}
              >
                <div
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 6,
                    padding: '2px 6px',
                    fontSize: 10,
                    color: 'var(--color-fg-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  {msg.content.length > 20 ? msg.content.slice(0, 18) + '…' : msg.content}
                </div>
              </foreignObject>
            </g>
          )
        })}

        {/* 화살표 마커 */}
        <defs>
          <marker id="arrowRight" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" />
          </marker>
          <marker id="arrowLeft" markerWidth="8" markerHeight="8" refX="2" refY="3" orient="auto">
            <path d="M8,0 L8,6 L0,3 z" fill="#3b82f6" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
