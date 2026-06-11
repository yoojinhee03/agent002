/**
 * 빌트인 도구 → 사용자 자격증명 매핑 (Phase 11-1).
 *
 * 같은 `targetId` 를 공유하는 도구들은 한 자격증명 1개로 묶어 관리한다
 * (예: gmail_search/gmail_send/... → tool:gmail OAuth 1개).
 *
 * 매핑 사전에 없는 도구는 자격증명 도출에서 제외 (utilities/내장 등).
 */
export type ToolAuthType = 'api_key' | 'oauth'

export interface ToolCredentialEntry {
  targetId: string
  label: string
  reason: string
  authType: ToolAuthType
}

export const TOOL_CREDENTIAL_MAP: Record<string, ToolCredentialEntry> = {
  // serper_search / brave_search 매핑 제거 — Built-in `search` 그룹 자체가 폐기됨
  // (runner 구현이 api_key 를 LLM 파라미터로 노출하는 미완성 구조). 웹 검색은 Tavily 등 MCP 서버로.

  // Google — API key
  google_translate: {
    targetId: 'google-translate',
    label: 'Google 번역',
    reason: 'Google Translation API 키',
    authType: 'api_key',
  },

  // Gmail — OAuth (사용자별 refresh_token)
  gmail_connect: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: 'Gmail OAuth 연동',
    authType: 'oauth',
  },
  gmail_search: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: '메일 검색 (OAuth)',
    authType: 'oauth',
  },
  gmail_fetch: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: '메일 조회 (OAuth)',
    authType: 'oauth',
  },
  gmail_fetch_attachment: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: '첨부 다운로드 (OAuth)',
    authType: 'oauth',
  },
  gmail_parse_pdf_attachment: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: 'PDF 첨부 분석 (OAuth)',
    authType: 'oauth',
  },
  gmail_send: {
    targetId: 'gmail',
    label: 'Gmail',
    reason: '메일 발송 (OAuth)',
    authType: 'oauth',
  },
}

/**
 * UI 카탈로그용 — `me-tools` 가 노출하는 도구 자격증명 종류 목록.
 * 현재 동일 `targetId` 를 dedup 하여 사용자가 등록 가능한 슬롯만 추린다.
 */
export interface ToolCatalogEntry {
  targetId: string
  label: string
  description: string
  authType: ToolAuthType
  triggers: string[] // 이 자격증명을 사용하는 builtin tool slug 목록
}

export const TOOL_CATALOG: ToolCatalogEntry[] = (() => {
  const grouped = new Map<string, ToolCatalogEntry>()
  for (const [slug, entry] of Object.entries(TOOL_CREDENTIAL_MAP)) {
    const cur = grouped.get(entry.targetId)
    if (cur) {
      cur.triggers.push(slug)
    } else {
      grouped.set(entry.targetId, {
        targetId: entry.targetId,
        label: entry.label,
        description: entry.reason,
        authType: entry.authType,
        triggers: [slug],
      })
    }
  }
  return Array.from(grouped.values())
})()
