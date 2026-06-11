/**
 * OpenAI 카탈로그 정리 — Frontier(10) + Deep research(2)만 enabled=true.
 *
 * 출처: https://developers.openai.com/api/docs/models/all (2026-05-19 확인)
 * 가격: https://developers.openai.com/api/docs/pricing
 *
 * 동작:
 *   1) Frontier/Deep research 모델을 upsert (없으면 생성, 있으면 갱신 + enabled=true)
 *   2) 그 외 OpenAI provider 모델은 enabled=false 로 비활성화 (DELETE 안 함 — 사용자 승인 영역)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface SeedModel {
  modelId: string
  name: string
  contextWindow: number
  inputPrice: number
  outputPrice: number
  capabilities: string[]
}

const FRONTIER_MODELS: SeedModel[] = [
  // ── GPT-5.5 시리즈 (최신, 2026) ──
  { modelId: 'gpt-5.5',      name: 'GPT-5.5',      contextWindow: 272_000, inputPrice: 5.0,  outputPrice: 30.0,  capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5.5-pro',  name: 'GPT-5.5 Pro',  contextWindow: 272_000, inputPrice: 30.0, outputPrice: 180.0, capabilities: ['chat', 'vision', 'function-calling'] },
  // ── GPT-5.4 시리즈 ──
  { modelId: 'gpt-5.4',      name: 'GPT-5.4',      contextWindow: 272_000, inputPrice: 2.5,  outputPrice: 15.0,  capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5.4-pro',  name: 'GPT-5.4 Pro',  contextWindow: 272_000, inputPrice: 30.0, outputPrice: 180.0, capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5.4-mini', name: 'GPT-5.4 mini', contextWindow: 272_000, inputPrice: 0.75, outputPrice: 4.5,   capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5.4-nano', name: 'GPT-5.4 nano', contextWindow: 272_000, inputPrice: 0.2,  outputPrice: 1.25,  capabilities: ['chat', 'function-calling'] },
  // ── GPT-5 시리즈 (frontier 페이지 유지 모델) ──
  { modelId: 'gpt-5',        name: 'GPT-5',        contextWindow: 128_000, inputPrice: 1.25, outputPrice: 10.0,  capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5-mini',   name: 'GPT-5 mini',   contextWindow: 128_000, inputPrice: 0.25, outputPrice: 2.0,   capabilities: ['chat', 'vision', 'function-calling'] },
  { modelId: 'gpt-5-nano',   name: 'GPT-5 nano',   contextWindow: 128_000, inputPrice: 0.05, outputPrice: 0.4,   capabilities: ['chat', 'function-calling'] },
  // ── GPT-4.1 (smartest non-reasoning) ──
  { modelId: 'gpt-4.1',      name: 'GPT-4.1',      contextWindow: 1_000_000, inputPrice: 2.0, outputPrice: 8.0, capabilities: ['chat', 'vision', 'function-calling'] },
]

const DEEP_RESEARCH_MODELS: SeedModel[] = [
  // 두 모델 모두 OpenAI 페이지에서 (Deprecated) 표시됨 — 등록은 하되 사용자에게 알릴 것.
  { modelId: 'o3-deep-research',      name: 'o3 Deep Research',      contextWindow: 200_000, inputPrice: 5.0, outputPrice: 20.0, capabilities: ['chat', 'reasoning', 'deep-research'] },
  { modelId: 'o4-mini-deep-research', name: 'o4-mini Deep Research', contextWindow: 200_000, inputPrice: 1.0, outputPrice: 4.0,  capabilities: ['chat', 'reasoning', 'deep-research'] },
]

const KEEP_MODEL_IDS = new Set<string>([
  ...FRONTIER_MODELS.map((m) => m.modelId),
  ...DEEP_RESEARCH_MODELS.map((m) => m.modelId),
])

async function main() {
  const provider = await prisma.provider.findUnique({ where: { slug: 'openai' } })
  if (!provider) throw new Error('OpenAI provider not found')

  console.log('[OpenAI] Frontier + Deep research 모델 정리\n')

  // 1) Frontier + Deep research upsert (enabled=true)
  const all: SeedModel[] = [...FRONTIER_MODELS, ...DEEP_RESEARCH_MODELS]
  for (const m of all) {
    const existed = await prisma.model.findUnique({
      where: { providerId_modelId: { providerId: provider.id, modelId: m.modelId } },
    })
    await prisma.model.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: m.modelId } },
      update: {
        name: m.name,
        contextWindow: m.contextWindow,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
        capabilities: m.capabilities,
        enabled: true,
      },
      create: { providerId: provider.id, ...m, enabled: true },
    })
    const ctx = m.contextWindow >= 1_000_000
      ? `${m.contextWindow / 1_000_000}M`
      : `${m.contextWindow / 1_000}K`
    console.log(`  ${existed ? '↺ enable' : '✅ create'}  ${m.modelId.padEnd(28)} ctx=${ctx.padEnd(6)} $${m.inputPrice}/$${m.outputPrice}`)
  }

  // 2) 그 외 OpenAI 모델은 enabled=false (DELETE 안 함)
  const others = await prisma.model.findMany({
    where: {
      providerId: provider.id,
      modelId: { notIn: Array.from(KEEP_MODEL_IDS) },
    },
    select: { id: true, modelId: true, enabled: true },
  })
  if (others.length === 0) {
    console.log('\n비활성 처리할 기타 모델 없음.')
  } else {
    console.log('\n비활성 처리 (enabled=false):')
    for (const o of others) {
      if (o.enabled) {
        await prisma.model.update({ where: { id: o.id }, data: { enabled: false } })
        console.log(`  ✖ ${o.modelId}`)
      } else {
        console.log(`  · ${o.modelId} (이미 비활성)`)
      }
    }
  }

  console.log('\n🎉 OpenAI 카탈로그 정리 완료')
}

main()
  .catch((e) => { console.error('❌ 실패:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
