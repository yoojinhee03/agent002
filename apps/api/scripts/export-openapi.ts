/**
 * 실행 중인 API 서버에서 Swagger/OpenAPI JSON spec 을 가져와 정적 파일로 저장.
 *
 * 사전 조건: API 서버가 떠 있어야 함 (`pnpm --filter @agent-studio/api dev`).
 *
 * 사용:
 *   pnpm --filter @agent-studio/api openapi:export
 *
 * 결과:
 *   apps/api/openapi.json — 전체 spec (frontend codegen / Postman import 용)
 *
 * 환경변수:
 *   API_URL — API 서버 주소 (default: http://localhost:4200)
 */
import { writeFileSync } from 'fs'
import { join } from 'path'

async function main() {
  const apiUrl = process.env.API_URL || 'http://localhost:4200'
  const url = `${apiUrl}/api/docs-json`

  console.log(`fetching: ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`)
  }
  const document = (await res.json()) as {
    paths?: Record<string, unknown>
    components?: { schemas?: Record<string, unknown> }
    tags?: Array<{ name: string }>
  }

  const outPath = join(__dirname, '..', 'openapi.json')
  writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf-8')

  console.log(`OpenAPI spec exported: ${outPath}`)
  console.log(`  paths: ${Object.keys(document.paths ?? {}).length}`)
  console.log(`  schemas: ${Object.keys(document.components?.schemas ?? {}).length}`)
  console.log(`  tags: ${(document.tags ?? []).map((t) => t.name).join(', ')}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  console.error('  → API 서버가 떠있는지 확인하세요: pnpm --filter @agent-studio/api dev')
  process.exit(1)
})
