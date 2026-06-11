/**
 * NAVER WORKS 메시지 콘텐츠 빌더.
 *
 * v1 은 plain text 만 지원. 추후 link/button_template/list_template 등 확장 시 spec.kind 분기 추가.
 * 문서(https://developers.worksmobile.com/kr/docs/bot-send-content)에 정의된 필드만 사용한다.
 *
 * 텍스트가 길면 NAVER WORKS API 한계(1000자 권장) 내로 분할해서 여러 contents 로 반환한다.
 */

export interface NaverWorksTextContent {
  type: 'text'
  text: string
}

export type NaverWorksContent = NaverWorksTextContent

const MAX_TEXT_LENGTH = 1000

export function buildTextContents(text: string): NaverWorksTextContent[] {
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return [{ type: 'text', text: '응답이 비어 있습니다.' }]
  }
  if (trimmed.length <= MAX_TEXT_LENGTH) {
    return [{ type: 'text', text: trimmed }]
  }

  const out: NaverWorksTextContent[] = []
  let remaining = trimmed
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, MAX_TEXT_LENGTH)
    if (remaining.length > MAX_TEXT_LENGTH) {
      const lastBreak = Math.max(
        chunk.lastIndexOf('\n\n'),
        chunk.lastIndexOf('\n'),
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf(' '),
      )
      if (lastBreak > MAX_TEXT_LENGTH * 0.5) {
        chunk = remaining.slice(0, lastBreak + 1)
      }
    }
    out.push({ type: 'text', text: chunk.trim() })
    remaining = remaining.slice(chunk.length).trim()
  }
  return out
}
