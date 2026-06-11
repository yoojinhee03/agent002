/**
 * MCP 서버 추가 시 사전 정의된 인기 항목 카탈로그.
 *
 * UI 는 카탈로그 카드에서 항목을 선택하면 name/description/transport/command/args 를
 * 자동으로 채우고, envSchema 에 정의된 시크릿(주로 API key)만 사용자에게 받는다.
 * (이전엔 npx 명령·args 를 사용자가 매번 직접 입력해 오타로 인한 args 분리 실수 등이
 *  자주 발생.)
 *
 * 카탈로그에 없는 MCP 는 "직접 입력" 모드로 form 을 비워두고 등록할 수 있다.
 */

export type McpCatalogCategory = 'search' | 'crawl' | 'docs' | 'fs' | 'dev' | 'other'

export interface McpEnvField {
  key: string
  /** 사용자에게 보여줄 짧은 라벨 (예: "API Key"). */
  label: string
  /** 필수 여부. true 면 빈 값일 때 저장 차단. */
  required: boolean
  /** 시크릿 여부. true 면 password 형 input + 저장 시 마스킹 표시. */
  secret: boolean
  /** placeholder 텍스트 — 형식 안내용 (예: "tvly-..."). */
  placeholder?: string
  /** 키 발급/안내 페이지 URL. */
  helpUrl?: string
}

export interface McpCatalogEntry {
  id: string
  name: string
  description: string
  /** 카드 아이콘 (emoji 또는 url). 일단 emoji 만 지원. */
  icon: string
  category: McpCatalogCategory
  /** transport. 현재 등록된 항목은 모두 stdio. */
  transport: 'stdio' | 'sse' | 'streamable_http'
  /** stdio 일 때 사용. */
  command?: string
  args?: string[]
  /** sse / streamable_http 일 때 사용. */
  url?: string
  headers?: Record<string, string>
  /** 사용자가 입력해야 할 env 변수 목록. 빈 배열이면 시크릿 없이 바로 등록 가능. */
  envSchema: McpEnvField[]
  /**
   * 사용자에게 노출하지 않는 카탈로그 기본 env. 등록 시 config.env 에 항상 합쳐진다.
   * 동일 키가 envSchema 사용자 입력값으로 들어오면 그 값이 우선한다.
   * 예: slack-mcp-server 의 SLACK_MCP_ADD_MESSAGE_TOOL — 전송 도구를 서버에 항상
   * 로드하고, 에이전트 단위 차단은 Tool Access Permissions 권한 정책으로 처리.
   */
  defaultEnv?: Record<string, string>
  /** 카드 보조 설명 (예: 무료 tier 안내, 발급 페이지 링크 등). */
  note?: string
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'tavily',
    name: 'Tavily Search',
    description: 'AI 에이전트용 웹 검색 — 요약·필터링이 내장된 검색 API',
    icon: '🔎',
    category: 'search',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tavily-mcp'],
    envSchema: [
      {
        key: 'TAVILY_API_KEY',
        label: 'Tavily API Key',
        required: true,
        secret: true,
        placeholder: 'tvly-...',
        helpUrl: 'https://app.tavily.com/',
      },
    ],
    note: 'API 키는 https://app.tavily.com/ → Dashboard 에서 발급',
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'OSS 라이브러리 공식 문서·코드 예제 RAG — 라이브러리 ID 로 정답 시그니처 조회',
    icon: '📚',
    category: 'docs',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    envSchema: [],
    note: 'Free tier — API 키 불필요. (rate limit 시 CONTEXT7_API_KEY 별도 등록 가능)',
  },
  {
    id: 'slack',
    name: 'Slack (Bot Token)',
    description: 'Slack 워크스페이스 메시지 조회·전송·검색 — Bot Token (xoxb) 기반',
    icon: '💬',
    category: 'other',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
    envSchema: [
      {
        key: 'SLACK_MCP_XOXB_TOKEN',
        label: 'Slack Bot User OAuth Token',
        required: true,
        secret: true,
        placeholder: 'xoxb-...',
        helpUrl: 'https://api.slack.com/apps',
      },
    ],
    defaultEnv: {
      // slack-mcp-server 의 전송 도구(conversations_add_message)는 기본 비활성이라
      // 이 env 로만 로드된다. 서버에는 항상 로드해두고, 채널별/에이전트별 차단은
      // Agent Studio 의 Tool Access Permissions 권한 정책으로 처리.
      SLACK_MCP_ADD_MESSAGE_TOOL: 'true',
    },
    note: 'Slack App → OAuth & Permissions → Bot User OAuth Token(xoxb-…) 복사. 봇이 접근할 채널에는 별도 초대(/invite) 필요. DM·미초대 채널은 Bot Token 으로 접근 불가. 전송 도구는 서버에 기본 로드되며, 에이전트 단위 차단은 Tool Access Permissions 에서 conversations_add_message 정책으로 설정.',
  },
]

export function findCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id)
}
