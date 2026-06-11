type Verbs = {
  created?: string
  updated?: string
  deleted?: string
  enabled?: string
  disabled?: string
  toggled?: string
  saved?: string
  applied?: string
  cloned?: string
  imported?: string
  exported?: string
  connected?: string
  disconnected?: string
  refreshed?: string
  invited?: string
  revoked?: string
  issued?: string
  deployed?: string
  undeployed?: string
  activated?: string
  deactivated?: string
  added?: string
  removed?: string
  rolledBack?: string
  ran?: string
}

const make = (subject: string, overrides: Verbs = {}): Required<Verbs> => ({
  created: `${subject}을(를) 추가했습니다.`,
  updated: `${subject} 정보를 수정했습니다.`,
  deleted: `${subject}을(를) 삭제했습니다.`,
  enabled: `${subject}을(를) 활성화했습니다.`,
  disabled: `${subject}을(를) 비활성화했습니다.`,
  toggled: `${subject} 상태를 변경했습니다.`,
  saved: `${subject}을(를) 저장했습니다.`,
  applied: `${subject}을(를) 적용했습니다.`,
  cloned: `${subject}을(를) 복제했습니다.`,
  imported: `${subject}을(를) 가져왔습니다.`,
  exported: `${subject}을(를) 내보냈습니다.`,
  connected: `${subject}을(를) 연결했습니다.`,
  disconnected: `${subject} 연결을 해제했습니다.`,
  refreshed: `${subject}을(를) 새로고침했습니다.`,
  invited: `${subject}을(를) 초대했습니다.`,
  revoked: `${subject}을(를) 폐기했습니다.`,
  issued: `${subject}을(를) 발급했습니다.`,
  deployed: `${subject}을(를) 배포했습니다.`,
  undeployed: `${subject} 배포를 해제했습니다.`,
  activated: `${subject}을(를) 활성화했습니다.`,
  deactivated: `${subject}을(를) 비활성화했습니다.`,
  added: `${subject}을(를) 추가했습니다.`,
  removed: `${subject}을(를) 제거했습니다.`,
  rolledBack: `${subject}을(를) 롤백했습니다.`,
  ran: `${subject}을(를) 실행했습니다.`,
  ...overrides,
})

export const MSG = {
  agent: make('에이전트'),
  team: make('팀'),
  tool: make('도구'),
  toolGroup: make('도구 그룹'),
  mcpServer: make('MCP 서버'),
  workflow: make('워크플로우'),
  workflowVersion: make('워크플로우 버전'),
  deployment: make('배포'),
  agentDeployment: make('에이전트 배포'),
  apiKey: make('API 키'),
  endpoint: make('엔드포인트'),
  provider: make('프로바이더'),
  model: make('모델'),
  environment: make('환경'),
  user: make('사용자'),
  project: make('프로젝트'),
  member: make('멤버'),
  schedule: make('스케줄'),
  slack: make('Slack 연동'),
  naverWorks: make('NAVER WORKS 연동'),
  promptVersion: make('프롬프트 버전'),
  credential: make('자격증명'),
  hitl: make('HITL 응답'),
  thread: make('스레드'),
  skill: {
    ...make('스킬'),
    applyProposal: '스킬을 생성했습니다.',
    applyEdit: '스킬을 수정했습니다.',
  },
  card: make('카드 정의', {
    created: '카드 정의를 발행했습니다.',
    cloned: '카드를 복제해 빌더로 이동합니다.',
  }),
} as const
