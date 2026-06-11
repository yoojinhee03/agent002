/**
 * Built-in 도구 인자 스키마 — HITL "직접 수정" 폼에서 파라미터 설명·제약을 표시한다.
 *
 * 원본(Source of truth): apps/agent-runner-py/src/modules/builtin_tools/custom_tools/*.py
 *   각 도구의 `*Args(BaseModel)` Pydantic 클래스. 백엔드 스키마가 바뀌면 이 파일도 갱신.
 *
 * 향후 개선: runner 가 HITL interrupt 발행 시 args_schema.model_json_schema() 결과를
 *   인터랙션 페이로드에 함께 실어 보내면 이 정적 맵을 제거하고 single source of truth 로
 *   전환할 수 있다.
 */

export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface ParameterSchema {
  /** 짧은 한국어 설명 — UI 라벨 아래에 1~2줄로 표시. */
  description: string
  /** 입력 타입 — UI rendering 힌트. */
  type: ParameterType
  /** 필수 여부 — 라벨 뒤 * 표시. */
  required?: boolean
  /** 기본값 — UI 에 "기본: ..." 표기. */
  default?: unknown
  /** 허용 값 enum — UI 에 "허용 값: A | B | C" 표기. */
  enum?: readonly (string | number)[]
  /** 숫자 최소값 (포함). */
  minimum?: number
  /** 숫자 최대값 (포함). */
  maximum?: number
  /** 문자열 최소 길이. */
  minLength?: number
  /** 문자열 최대 길이. */
  maxLength?: number
  /** 예시 값 — placeholder 로 사용. */
  example?: string
  /** 사용자 펼침 도움말 — 문법 설명·예시 목록. UI 에서 "도움말" 버튼으로 토글한다. */
  help?: {
    /** 도움말 인트로 텍스트 (마크다운 미지원 — 줄바꿈만 허용). */
    intro?: string
    /** 클릭으로 입력란에 삽입 가능한 예시 패턴 목록. */
    examples?: Array<{ pattern: string; description: string }>
  }
}

export interface ToolSchema {
  id: string
  args: Record<string, ParameterSchema>
}

export const BUILTIN_TOOL_SCHEMAS: Record<string, ToolSchema> = {
  context7_search_libraries: {
    id: 'context7_search_libraries',
    args: {
      library_name: {
        description: '검색할 라이브러리·프레임워크 이름',
        type: 'string',
        required: true,
        minLength: 1,
        example: 'next.js',
      },
      query: {
        description: '선택 — 자연어 보조 키워드 (관련도 향상)',
        type: 'string',
        example: 'app router server actions',
      },
    },
  },
  context7_get_docs: {
    id: 'context7_get_docs',
    args: {
      library_id: {
        description: 'Context7 라이브러리 ID — context7_search_libraries 결과의 id 값',
        type: 'string',
        required: true,
        minLength: 1,
        example: '/vercel/next.js',
      },
      query: {
        description: '조회할 토픽·기능에 대한 자연어 질의',
        type: 'string',
        required: true,
        minLength: 1,
        example: 'how to define route segment config',
      },
    },
  },
  gmail_search: {
    id: 'gmail_search',
    args: {
      q: {
        description: 'Gmail 검색 문법 (from:, subject:, after:, has:attachment 등)',
        type: 'string',
        required: true,
        minLength: 1,
        example: 'from:noreply@example.com after:2024/01/01',
        help: {
          intro:
            'Gmail 검색 연산자를 사용해 정밀하게 조회합니다. 공백으로 여러 조건을 묶으면 AND, "OR" 로 연결하면 OR, 앞에 "-" 를 붙이면 제외입니다.\n예) from:boss subject:report after:2024/01/01 -is:read',
          examples: [
            { pattern: 'from:user@example.com', description: '특정 보낸 사람' },
            { pattern: 'to:me', description: '나에게 온 메일' },
            { pattern: 'subject:"회의록"', description: '제목에 정확히 "회의록" 포함' },
            { pattern: 'has:attachment', description: '첨부 파일 있음' },
            { pattern: 'filename:pdf', description: '특정 확장자 첨부' },
            { pattern: 'after:2024/01/01', description: '날짜 이후 (YYYY/MM/DD)' },
            { pattern: 'before:2024/12/31', description: '날짜 이전' },
            { pattern: 'newer_than:7d', description: '최근 7일 (h/d/m/y)' },
            { pattern: 'older_than:1m', description: '1개월 이전' },
            { pattern: 'is:unread', description: '안 읽은 메일' },
            { pattern: 'is:starred', description: '별표 표시' },
            { pattern: 'is:important', description: '중요 메일' },
            { pattern: 'in:inbox', description: '받은편지함' },
            { pattern: 'in:sent', description: '보낸편지함' },
            { pattern: 'in:spam', description: '스팸함' },
            { pattern: 'in:anywhere', description: '전체 메일함 (스팸·휴지통 포함)' },
            { pattern: 'label:work', description: '특정 라벨' },
            { pattern: 'category:promotions', description: '프로모션 탭' },
            { pattern: 'larger:5M', description: '5MB 이상' },
            { pattern: 'OR', description: 'OR 결합 (대문자)' },
            { pattern: '-from:newsletter@', description: '특정 보낸 사람 제외' },
          ],
        },
      },
      user_id: { description: 'Gmail 사용자 ID', type: 'string', default: 'me' },
      max_results: {
        description: '반환할 메일 개수',
        type: 'number',
        default: 10,
        minimum: 1,
        maximum: 100,
      },
      include_spam_trash: {
        description: '스팸·휴지통 메일 포함 여부',
        type: 'boolean',
        default: false,
      },
      page_token: {
        description: '다음 페이지 토큰 — 추가 페이지 조회 시에만 사용',
        type: 'string',
      },
      include_body: {
        description: '본문 텍스트 포함 (false 면 제목·발신자만 반환)',
        type: 'boolean',
        default: true,
      },
      max_body_chars: {
        description: '본문 최대 문자 수 (include_body=true 일 때)',
        type: 'number',
        default: 3000,
        minimum: 0,
      },
    },
  },
  gmail_fetch: {
    id: 'gmail_fetch',
    args: {
      message_id: {
        description: 'Gmail 메시지 ID',
        type: 'string',
        required: true,
        minLength: 1,
      },
      user_id: { description: 'Gmail 사용자 ID', type: 'string', default: 'me' },
      include_attachments: {
        description: '첨부 메타데이터 포함 여부',
        type: 'boolean',
        default: true,
      },
      unzip_attachments: {
        description: '.zip 첨부 자동 해제 (안전 한도 적용)',
        type: 'boolean',
        default: true,
      },
      include_attachment_data: {
        description: '첨부 파일을 base64 로 다운로드해 포함 (느림·큼)',
        type: 'boolean',
        default: false,
      },
      include_unzipped_data: {
        description: '해제된 zip 내부 파일 데이터 포함',
        type: 'boolean',
        default: false,
      },
      include_payload: {
        description: 'Gmail API payload 원본 포함',
        type: 'boolean',
        default: false,
      },
      max_body_chars: {
        description: '본문 최대 문자 수',
        type: 'number',
        default: 20000,
        minimum: 0,
      },
    },
  },
  gmail_send: {
    id: 'gmail_send',
    args: {
      to: {
        description: '수신자 이메일 주소',
        type: 'string',
        required: true,
        example: 'user@example.com',
      },
      subject: { description: '메일 제목', type: 'string', required: true },
      body: { description: '메일 본문 (plain text)', type: 'string', required: true },
      user_id: { description: 'Gmail 사용자 ID', type: 'string', default: 'me' },
      cc: { description: '참조(CC) 이메일 주소 — 선택', type: 'string' },
      bcc: { description: '숨은 참조(BCC) 이메일 주소 — 선택', type: 'string' },
      reply_to_message_id: {
        description: '답장할 원본 메시지 ID — 스레드 연결 시에만 사용',
        type: 'string',
      },
    },
  },
  gmail_fetch_attachment: {
    id: 'gmail_fetch_attachment',
    args: {
      message_id: { description: 'Gmail 메시지 ID', type: 'string' },
      q: {
        description: 'message_id 없을 때 사용할 검색어 — 최신 메시지 자동 선택',
        type: 'string',
        help: {
          intro:
            'gmail_search 와 동일한 검색 문법. 보통 첨부가 있는 최신 메일을 자동 선택할 때 사용합니다.',
          examples: [
            { pattern: 'has:attachment newer_than:7d', description: '최근 7일 첨부 메일' },
            { pattern: 'from:hr@example.com has:attachment', description: '특정 보낸 사람 첨부' },
            { pattern: 'filename:pdf', description: 'PDF 첨부' },
            { pattern: 'subject:"보고서" has:attachment', description: '제목 + 첨부' },
          ],
        },
      },
      attachment_id: { description: '첨부 ID', type: 'string' },
      filename: {
        description: 'attachment_id 없을 때 파일명으로 첨부 찾기',
        type: 'string',
      },
      user_id: { description: 'Gmail 사용자 ID', type: 'string', default: 'me' },
      include_data: {
        description: 'base64 데이터 포함 여부 (false 면 메타만)',
        type: 'boolean',
        default: true,
      },
      max_bytes: {
        description: '다운로드 최대 바이트 — 초과 시 메타만 반환',
        type: 'number',
        default: 5242880,
        minimum: 0,
      },
    },
  },
  gmail_parse_pdf_attachment: {
    id: 'gmail_parse_pdf_attachment',
    args: {
      message_id: { description: 'Gmail 메시지 ID', type: 'string' },
      q: {
        description: 'message_id 없을 때 사용할 검색어',
        type: 'string',
        help: {
          intro:
            'gmail_search 와 동일한 검색 문법. PDF 첨부가 있는 메일을 빠르게 찾을 때 사용합니다.',
          examples: [
            { pattern: 'has:attachment filename:pdf', description: 'PDF 첨부 메일' },
            { pattern: 'subject:"주민등록등본" has:attachment', description: '특정 서류 + 첨부' },
            { pattern: 'from:noreply@hr.example.com filename:pdf newer_than:30d',
              description: '최근 30일 + 특정 보낸 사람 + PDF' },
          ],
        },
      },
      attachment_id: {
        description: '첨부 ID (gmail_fetch 결과)',
        type: 'string',
      },
      user_id: { description: 'Gmail 사용자 ID', type: 'string', default: 'me' },
      filename: {
        description: '원본 파일명 — 문서 종류 식별 + attachment_id 없을 때 검색용',
        type: 'string',
        default: '',
        example: '주민등록등본_홍길동.pdf',
      },
      candidate_name: {
        description: '교차검증용 신청자 이름',
        type: 'string',
        default: '',
      },
      password: {
        description: 'PDF 비밀번호 (암호화된 경우)',
        type: 'string',
      },
      dpi: {
        description: '이미지 변환 해상도 (DPI)',
        type: 'number',
        default: 150,
        minimum: 72,
        maximum: 300,
      },
      max_bytes: {
        description: '다운로드 최대 바이트 — 0 이면 무제한',
        type: 'number',
        default: 0,
        minimum: 0,
      },
    },
  },
  pdf_parse: {
    id: 'pdf_parse',
    args: {
      pages: {
        description:
          'document_preprocess 결과 페이지 리스트 — [{page, image_base64, mime_type}, ...]',
        type: 'array',
      },
      file_data_base64: {
        description: 'pages 없을 때 base64 인코딩된 PDF 파일 데이터',
        type: 'string',
      },
      password: { description: 'PDF 비밀번호 (암호화된 경우)', type: 'string' },
      dpi: {
        description: '이미지 변환 해상도 (DPI)',
        type: 'number',
        default: 150,
        minimum: 72,
        maximum: 300,
      },
      filename: {
        description: '원본 파일명 — 문서 종류 식별 힌트',
        type: 'string',
        default: '',
      },
      candidate_name: {
        description: '교차검증용 신청자 이름',
        type: 'string',
        default: '',
      },
    },
  },
  document_preprocess: {
    id: 'document_preprocess',
    args: {
      file_data_base64: {
        description: 'base64 인코딩된 PDF 파일 데이터',
        type: 'string',
        required: true,
        minLength: 1,
      },
      filename: {
        description: '원본 파일명',
        type: 'string',
        required: true,
        minLength: 1,
        example: '주민등록등본.pdf',
      },
      password: {
        description: 'PDF 비밀번호 (주민번호 6자리 등)',
        type: 'string',
      },
      dpi: {
        description: '이미지 변환 해상도 (DPI) — 150 권장',
        type: 'number',
        default: 150,
        minimum: 72,
        maximum: 300,
      },
      max_pages: {
        description: '변환할 최대 페이지 수',
        type: 'number',
        default: 1,
        minimum: 1,
        maximum: 10,
      },
    },
  },
  task: {
    id: 'task',
    args: {
      subagent_type: {
        description: '호출할 서브에이전트 이름',
        type: 'string',
        required: true,
      },
      description: {
        description: '서브에이전트가 수행할 작업 설명 (자연어 지시)',
        type: 'string',
        required: true,
      },
    },
  },
  write_todos: {
    id: 'write_todos',
    args: {
      todos: {
        description:
          '계획 항목 리스트 — [{content: str, status: "pending"|"in_progress"|"completed"}, ...]',
        type: 'array',
        required: true,
        help: {
          intro:
            '각 항목은 content(작업 내용)와 status(상태)를 가집니다. status 는 다음 셋 중 하나:\n· pending — 아직 시작 안 함\n· in_progress — 진행 중 (현재 답변에서 다룰 항목)\n· completed — 완료',
          examples: [
            {
              pattern:
                '[{"content":"자료 조사","status":"in_progress"},{"content":"초안 작성","status":"pending"}]',
              description: '2개 항목 (1번 진행 중)',
            },
            {
              pattern:
                '[{"content":"검색","status":"completed"},{"content":"분석","status":"completed"},{"content":"요약","status":"in_progress"}]',
              description: '3단계 워크플로우',
            },
          ],
        },
      },
    },
  },
}

export function getToolSchema(toolName: string): ToolSchema | undefined {
  return BUILTIN_TOOL_SCHEMAS[toolName]
}

export function getParameterSchema(
  toolName: string,
  paramKey: string,
): ParameterSchema | undefined {
  return BUILTIN_TOOL_SCHEMAS[toolName]?.args[paramKey]
}

/**
 * 파라미터 스키마에서 사용자에게 보여줄 제약 정보를 한 줄 문자열로 합성.
 * 예: "허용 값: 'pending' | 'in_progress' · 범위: 1 ~ 100 · 기본: 10"
 */
export function summarizeConstraints(schema: ParameterSchema): string {
  const parts: string[] = []
  if (schema.enum && schema.enum.length > 0) {
    parts.push(`허용 값: ${schema.enum.map((v) => `'${v}'`).join(' | ')}`)
  }
  if (
    schema.type === 'number' &&
    (schema.minimum != null || schema.maximum != null)
  ) {
    const lo = schema.minimum != null ? String(schema.minimum) : '-∞'
    const hi = schema.maximum != null ? String(schema.maximum) : '∞'
    parts.push(`범위: ${lo} ~ ${hi}`)
  }
  if (
    schema.type === 'string' &&
    (schema.minLength != null || schema.maxLength != null)
  ) {
    const lo = schema.minLength != null ? String(schema.minLength) : '0'
    const hi = schema.maxLength != null ? String(schema.maxLength) : '∞'
    parts.push(`길이: ${lo} ~ ${hi}`)
  }
  if (schema.default !== undefined && schema.default !== null && schema.default !== '') {
    const def =
      typeof schema.default === 'string'
        ? schema.default
        : JSON.stringify(schema.default)
    parts.push(`기본: ${def}`)
  }
  return parts.join(' · ')
}
