// ============================================================
// Built-in Tool Catalog
// 플랫폼이 기본 제공하는 도구 그룹 정의
// ============================================================

export interface BuiltinToolDef {
  id: string
  name: string
  description: string
  groupId: string
  requiresConfig: boolean
  labels?: Record<string, string> // HITL 카드 라벨 사전 — dot-path → 한국어
  inputSchema?: Record<string, unknown> // JSON Schema — HITL 카드 빌더의 자동 폼 생성용
}

export interface BuiltinGroupDef {
  id: string
  name: string
  description: string
  tools: BuiltinToolDef[]
}

export const BUILTIN_GROUPS: BuiltinGroupDef[] = [
  // Built-in `search` 그룹(serper_search, brave_search) 제거 — runner 구현이
  // api_key 를 LLM 파라미터로 노출하는 미완성 상태라 사용 불가능. Tavily 등 MCP 서버로 대체.
  // Built-in `docs` 그룹(context7_*) 도 제거 — `Context7` MCP 서버(`@upstash/context7-mcp`)로
  // 일원화. (MCP 카탈로그 → Context7 카드로 한 번에 등록 가능)
  {
    id: 'google',
    name: 'Google',
    description: 'Google 서비스 연동 도구',
    tools: [
      {
        id: 'google_translate',
        name: 'Google 번역',
        description: '텍스트를 지정 언어로 번역합니다',
        groupId: 'google',
        requiresConfig: true,
        labels: {
          text: '원문',
          target: '대상 언어',
          source: '원본 언어',
        },
        inputSchema: {
          type: 'object',
          required: ['text', 'target'],
          properties: {
            text: { type: 'string', title: '원문', description: '번역할 원본 텍스트' },
            target: { type: 'string', title: '대상 언어', description: 'ISO 639-1 코드 (예: ko, en, ja)' },
            source: { type: 'string', title: '원본 언어', description: '비우면 자동 감지' },
          },
        },
      },
      {
        id: 'gmail_connect',
        name: 'Gmail 연동',
        description: 'Gmail OAuth를 통해 계정을 연동합니다 (Gmail 관련 도구 공통 설정)',
        groupId: 'google',
        requiresConfig: false,
      },
      {
        id: 'gmail_search',
        name: 'Gmail 검색',
        description: 'Gmail 검색 문법으로 메일 목록을 검색합니다 (Gmail API users.messages.list)',
        groupId: 'google',
        requiresConfig: false,
        labels: {
          q: '검색어',
          max_results: '최대 결과 개수',
        },
        inputSchema: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', title: '검색어', description: 'Gmail 검색 문법' },
            max_results: { type: 'integer', title: '최대 결과 개수', default: 10, minimum: 1, maximum: 100 },
          },
        },
      },
      {
        id: 'gmail_fetch',
        name: 'Gmail 메일 조회',
        description: '메일 전문(본문/헤더/첨부)을 조회합니다 (Gmail API users.messages.get?format=full)',
        groupId: 'google',
        requiresConfig: false,
      },
      {
        id: 'gmail_fetch_attachment',
        name: 'Gmail 첨부 다운로드',
        description: '메일 첨부파일 1개를 attachmentId로 다운로드합니다 (대용량 payload 방지용)',
        groupId: 'google',
        requiresConfig: false,
        labels: {
          message_id: '메일 ID',
          attachment_id: '첨부 ID',
        },
        inputSchema: {
          type: 'object',
          required: ['message_id', 'attachment_id'],
          properties: {
            message_id: { type: 'string', title: '메일 ID', description: 'Gmail 메일 ID' },
            attachment_id: { type: 'string', title: '첨부 ID', description: '첨부파일 ID' },
          },
        },
      },
      {
        id: 'gmail_parse_pdf_attachment',
        name: 'Gmail PDF 자동 파싱',
        description: 'Gmail PDF 첨부 1개를 다운로드 후 전처리하고(pdf→이미지), Vision 추출(pdf_parse)까지 수행합니다 (pages/base64 미반환)',
        groupId: 'google',
        requiresConfig: false,
      },
      {
        id: 'gmail_send',
        name: 'Gmail 메일 발송',
        description: 'Gmail로 메일을 발송합니다. 담당자 승인 후에만 호출해야 합니다.',
        groupId: 'google',
        requiresConfig: false,
        labels: {
          to: '받는 사람',
          cc: '참조',
          bcc: '숨은참조',
          subject: '제목',
          body: '본문',
          'attachments[*].filename': '첨부 파일명',
        },
        inputSchema: {
          type: 'object',
          required: ['to', 'subject', 'body'],
          properties: {
            to: { type: 'string', title: '받는 사람', description: '쉼표로 구분한 이메일 주소' },
            cc: { type: 'string', title: '참조' },
            bcc: { type: 'string', title: '숨은참조' },
            subject: { type: 'string', title: '제목' },
            body: { type: 'string', title: '본문', description: '본문 (긴 텍스트)', format: 'textarea' },
          },
        },
      },
    ],
  },
  {
    id: 'hr',
    name: 'HR',
    description: 'HR 관련 도구',
    tools: [
      {
        id: 'calculate_service_period',
        name: '재직기간 계산',
        description: '입사일·퇴사일로 재직일수·연수·개월수를 계산합니다',
        groupId: 'hr',
        requiresConfig: false,
      },
      {
        id: 'calculate_average_daily_wage',
        name: '1일 평균임금 계산',
        description: '월 평균임금·연간 상여금으로 법정 1일 평균임금을 산정합니다',
        groupId: 'hr',
        requiresConfig: false,
      },
      {
        id: 'calculate_retirement_pay',
        name: '퇴직금 계산',
        description: '1일 평균임금·재직일수로 법정 퇴직급여를 산출합니다',
        groupId: 'hr',
        requiresConfig: false,
      },
      {
        id: 'generate_settlement_report',
        name: '정산 리포트 생성',
        description: '계산 결과를 사용자에게 전달할 정산 리포트로 변환합니다',
        groupId: 'hr',
        requiresConfig: false,
      }
    ],
  },
  {
    id: 'skills',
    name: 'Skills CRUD',
    description: 'Agent 가 사용자 스킬을 LLM 도구 호출로 CRUD 하기 위한 도구 모음',
    tools: [
      {
        id: 'skill.list',
        name: '스킬 목록 조회',
        description: '현재 사용자의 스킬 목록을 반환',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.get',
        name: '스킬 상세 조회',
        description: '스킬 ID 로 instructions/도구/파일을 포함한 상세 정보 조회',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.create',
        name: '스킬 생성',
        description: 'name/description/instructions/allowedTools/files 로 새 스킬 생성',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.update',
        name: '스킬 수정',
        description: '기존 스킬의 필드를 부분 업데이트',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.delete',
        name: '스킬 삭제',
        description: '스킬을 영구 삭제 (파일도 cascade 삭제)',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.add_file',
        name: '스킬 파일 추가',
        description: '스킬에 파일을 추가하거나 같은 경로의 기존 파일 덮어쓰기',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.delete_file',
        name: '스킬 파일 삭제',
        description: '스킬의 특정 파일 삭제',
        groupId: 'skills',
        requiresConfig: false,
      },
      {
        id: 'skill.catalog',
        name: '스킬 카탈로그 조회',
        description: 'builtin/MCP/skills 카탈로그 조회 — allowed_tools 후보 선정용',
        groupId: 'skills',
        requiresConfig: false,
      },
    ],
  },
  {
    id: 'utilities',
    name: 'Utilities',
    description: '플랫폼 내장 유틸리티 도구',
    tools: [
      {
        id: 'current_time',
        name: '현재 시간',
        description: '현재 날짜와 시간을 ISO 8601 형식으로 반환합니다',
        groupId: 'utilities',
        requiresConfig: false,
      },
        {
          id: 'ask_missing_info',
          name: '누락 정보 질문',
          description: '누락된 입력 항목을 파악하고 사용자에게 질문 메시지를 생성합니다',
          groupId: 'hr',
          requiresConfig: false,
        }
      // document_preprocess / pdf_parse 는 runner registry.py 정책상 LLM 도구로 노출하지
      // 않고 `gmail_parse_pdf_attachment` 내부 파이프라인에서만 호출된다. 카탈로그에서도
      // 제거하여 사용자에게 "활성화 가능한 도구" 처럼 보이는 UX 혼란을 막는다. 코드 자체는
      // 보존되어 있어 향후 일반 PDF 입력 흐름으로 노출하려면 registry 등록만 추가하면 된다.
    ],
  },
]

export const BUILTIN_TOOL_IDS = new Set(
  BUILTIN_GROUPS.flatMap((g) => g.tools.map((t) => t.id)),
)

export function getBuiltinToolDef(toolId: string): BuiltinToolDef | undefined {
  for (const group of BUILTIN_GROUPS) {
    const tool = group.tools.find((t) => t.id === toolId)
    if (tool) return tool
  }
  return undefined
}
