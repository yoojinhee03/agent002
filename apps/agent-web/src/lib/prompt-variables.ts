import type { AgentArchitecture } from '@agent-studio/shared'

export interface PromptVariable {
  key: string          // 실제 삽입될 문자열 e.g. {{agent.name}}
  label: string        // 표시명
  desc: string         // 설명
  example?: string     // 치환 예시값
}

export interface VariableGroup {
  id: string
  label: string
  color: string        // tailwind text color class
  bgColor: string      // tailwind bg color class
  borderColor: string  // tailwind border color class
  architectures: AgentArchitecture[] | 'all'
  variables: PromptVariable[]
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    id: 'common',
    label: '공통',
    color: 'text-fg-muted',
    bgColor: 'bg-[#1e2130]',
    borderColor: 'border-[#2a2d3a]',
    architectures: 'all',
    variables: [
      { key: '{{agent.name}}',        label: '에이전트 이름',   desc: '현재 에이전트의 이름',         example: 'My Agent' },
      { key: '{{agent.description}}', label: '에이전트 설명',   desc: '에이전트의 역할/목적 설명',      example: 'AI 어시스턴트' },
      { key: '{{current_date}}',      label: '현재 날짜',       desc: 'YYYY-MM-DD 형식',              example: '2026-04-11' },
      { key: '{{current_time}}',      label: '현재 시간',       desc: 'HH:MM:SS 형식',               example: '14:30:00' },
      { key: '{{user.message}}',      label: '사용자 메시지',   desc: '사용자의 입력 메시지 원문',      example: '데이터를 분석해줘' },
      { key: '{{tools.list}}',         label: '도구 목록',       desc: '연결된 도구 이름 콤마 구분',          example: 'tavily_search, read_file' },
      { key: '{{tools.count}}',        label: '도구 수',         desc: '현재 연결된 도구 총 개수',            example: '3' },
      { key: '{{tools.descriptions}}', label: '도구 설명 목록',  desc: '도구 이름과 설명을 줄바꿈으로 나열',  example: 'tavily_search: AI 에이전트용 웹 검색' },
    ],
  },
  {
    id: 'react',
    label: 'Deep Autonomous',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    architectures: ['react'],
    variables: [
      { key: '{{react.max_iterations}}', label: '최대 반복 횟수',      desc: '루프 실행 가능 최대 횟수',              example: '10' },
      { key: '{{react.sub_agents}}',     label: '서브 에이전트 목록',   desc: '위임 가능한 에이전트 이름 콤마 구분',   example: 'researcher, coder' },
      { key: '{{vfs.root}}',             label: 'VFS 경로',            desc: '가상 파일 시스템 루트 경로',            example: '/workspace' },
    ],
  },
  {
    id: 'plan_execute',
    label: '계획 및 실행',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    architectures: ['plan_execute'],
    variables: [
      { key: '{{plan.mode}}',        label: '실행 전략',          desc: 'sequential / parallel / conditional',  example: 'sequential' },
      { key: '{{plan.depth}}',       label: '계획 깊이',          desc: '계획 세분화 수준 (1~5)',                example: '3' },
      { key: '{{plan.sub_agents}}',  label: '서브 에이전트 목록', desc: '단계별 위임 가능한 에이전트 이름',       example: 'analyst, writer' },
    ],
  },
  {
    id: 'tool_calling',
    label: '빠른 도구 사용',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    architectures: ['tool_calling'],
    variables: [
      { key: '{{tools.parallel}}', label: '병렬 실행',    desc: '도구 병렬 호출 여부 (true/false)',  example: 'true' },
    ],
  },
]

/** 현재 활성화된 아키텍처에 맞는 그룹만 반환 */
export function getActiveVariableGroups(architectures: AgentArchitecture[]): VariableGroup[] {
  return VARIABLE_GROUPS.filter(g =>
    g.architectures === 'all' || g.architectures.some(a => architectures.includes(a))
  )
}
