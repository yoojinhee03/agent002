import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Create test user
  const passwordHash = await bcrypt.hash('password', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      role: 'admin',
    },
    create: {
      name: '관리자',
      email: 'admin@example.com',
      password: passwordHash,
      status: 'active',
      role: 'admin',
      activatedAt: new Date(),
    },
  })
  console.log(`✅ User created: ${admin.email}`)

  const editor = await prisma.user.upsert({
    where: { email: 'editor@example.com' },
    update: {},
    create: {
      name: '편집자',
      email: 'editor@example.com',
      password: passwordHash,
      status: 'active',
      activatedAt: new Date(),
    },
  })
  console.log(`✅ User created: ${editor.email}`)

  // 2. Create providers (Provider 자체만 upsert — 모델은 아래에서 별도로 upsert)
  const openai = await prisma.provider.upsert({
    where: { slug: 'openai' },
    update: {},
    create: {
      name: 'OpenAI',
      slug: 'openai',
      type: 'cloud',
    },
  })
  console.log(`✅ Provider ready: ${openai.name}`)

  const anthropic = await prisma.provider.upsert({
    where: { slug: 'anthropic' },
    update: {},
    create: {
      name: 'Anthropic',
      slug: 'anthropic',
      type: 'cloud',
    },
  })
  console.log(`✅ Provider ready: ${anthropic.name}`)

  const google = await prisma.provider.upsert({
    where: { slug: 'google' },
    update: {},
    create: {
      name: 'Google',
      slug: 'google',
      type: 'cloud',
    },
  })
  console.log(`✅ Provider ready: ${google.name}`)

  // 3. Models — context7 (developers.openai.com / docs.anthropic.com / ai.google.dev) 기준
  //    가격은 1M 토큰당 USD (input / output). 컨텍스트 윈도우는 토큰 단위.
  type ModelSeed = {
    modelId: string
    name: string
    contextWindow: number
    inputPrice: number
    outputPrice: number
    capabilities: string[]
  }

  const openaiModels: ModelSeed[] = [
    { modelId: 'gpt-5.4',        name: 'GPT-5.4',        contextWindow: 272000,  inputPrice: 2.5,  outputPrice: 15,  capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5.4-mini',   name: 'GPT-5.4 mini',   contextWindow: 272000,  inputPrice: 0.75, outputPrice: 4.5, capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5.4-nano',   name: 'GPT-5.4 nano',   contextWindow: 400000,  inputPrice: 0.2,  outputPrice: 1.25, capabilities: ['chat', 'function-calling'] },
    { modelId: 'gpt-5.4-pro',    name: 'GPT-5.4 pro',    contextWindow: 272000,  inputPrice: 30,   outputPrice: 180, capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5.2',        name: 'GPT-5.2',        contextWindow: 400000,  inputPrice: 1.75, outputPrice: 14,  capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5.1',        name: 'GPT-5.1',        contextWindow: 400000,  inputPrice: 1.25, outputPrice: 10,  capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5',          name: 'GPT-5',          contextWindow: 400000,  inputPrice: 1.25, outputPrice: 10,  capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5-mini',     name: 'GPT-5 mini',     contextWindow: 400000,  inputPrice: 0.25, outputPrice: 2,   capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-5-nano',     name: 'GPT-5 nano',     contextWindow: 400000,  inputPrice: 0.05, outputPrice: 0.4, capabilities: ['chat', 'function-calling'] },
    { modelId: 'gpt-5-pro',      name: 'GPT-5 pro',      contextWindow: 400000,  inputPrice: 15,   outputPrice: 120, capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'gpt-4.1',        name: 'GPT-4.1',        contextWindow: 1000000, inputPrice: 2,    outputPrice: 8,   capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'gpt-4.1-mini',   name: 'GPT-4.1 mini',   contextWindow: 1000000, inputPrice: 0.4,  outputPrice: 1.6, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'gpt-4.1-nano',   name: 'GPT-4.1 nano',   contextWindow: 1000000, inputPrice: 0.1,  outputPrice: 0.4, capabilities: ['chat', 'function-calling'] },
    { modelId: 'gpt-4o',         name: 'GPT-4o',         contextWindow: 128000,  inputPrice: 2.5,  outputPrice: 10,  capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'gpt-4o-mini',    name: 'GPT-4o mini',    contextWindow: 128000,  inputPrice: 0.15, outputPrice: 0.6, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'o1',             name: 'o1',             contextWindow: 200000,  inputPrice: 15,   outputPrice: 60,  capabilities: ['chat', 'reasoning'] },
    { modelId: 'o3',             name: 'o3',             contextWindow: 200000,  inputPrice: 2,    outputPrice: 8,   capabilities: ['chat', 'reasoning', 'function-calling'] },
    { modelId: 'o3-mini',        name: 'o3 mini',        contextWindow: 200000,  inputPrice: 1.1,  outputPrice: 4.4, capabilities: ['chat', 'reasoning', 'function-calling'] },
    { modelId: 'o4-mini',        name: 'o4 mini',        contextWindow: 200000,  inputPrice: 1.1,  outputPrice: 4.4, capabilities: ['chat', 'reasoning', 'function-calling'] },
  ]

  const anthropicModels: ModelSeed[] = [
    { modelId: 'claude-opus-4-7',           name: 'Claude Opus 4.7',         contextWindow: 1000000, inputPrice: 15,  outputPrice: 75, capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'claude-opus-4-6',           name: 'Claude Opus 4.6',         contextWindow: 200000,  inputPrice: 15,  outputPrice: 75, capabilities: ['chat', 'vision', 'function-calling', 'reasoning'] },
    { modelId: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6',       contextWindow: 1000000, inputPrice: 3,   outputPrice: 15, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'claude-sonnet-4-5',         name: 'Claude Sonnet 4.5',       contextWindow: 1000000, inputPrice: 3,   outputPrice: 15, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (2025-09-29)', contextWindow: 1000000, inputPrice: 3, outputPrice: 15, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'claude-sonnet-4-20250514',  name: 'Claude Sonnet 4',         contextWindow: 200000,  inputPrice: 3,   outputPrice: 15, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5',        contextWindow: 200000,  inputPrice: 0.8, outputPrice: 4,  capabilities: ['chat', 'vision', 'function-calling'] },
  ]

  const googleModels: ModelSeed[] = [
    { modelId: 'gemini-3-pro',                  name: 'Gemini 3 Pro',                  contextWindow: 1048576, inputPrice: 2,    outputPrice: 12,  capabilities: ['chat', 'vision', 'audio', 'video', 'function-calling', 'thinking'] },
    { modelId: 'gemini-3-flash-preview',        name: 'Gemini 3 Flash (Preview)',      contextWindow: 1048576, inputPrice: 0.3,  outputPrice: 2.5, capabilities: ['chat', 'vision', 'audio', 'video', 'function-calling', 'thinking'] },
    { modelId: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live (Preview)', contextWindow: 131072, inputPrice: 0.3,  outputPrice: 2.5, capabilities: ['chat', 'vision', 'audio', 'video', 'function-calling', 'live'] },
    { modelId: 'gemini-2.5-pro',                name: 'Gemini 2.5 Pro',                contextWindow: 1048576, inputPrice: 1.25, outputPrice: 10,  capabilities: ['chat', 'vision', 'audio', 'function-calling', 'thinking'] },
    { modelId: 'gemini-2.5-flash',              name: 'Gemini 2.5 Flash',              contextWindow: 1048576, inputPrice: 0.3,  outputPrice: 2.5, capabilities: ['chat', 'vision', 'audio', 'function-calling', 'thinking'] },
    { modelId: 'gemini-2.5-flash-lite',         name: 'Gemini 2.5 Flash Lite',         contextWindow: 1048576, inputPrice: 0.1,  outputPrice: 0.4, capabilities: ['chat', 'vision', 'function-calling'] },
    { modelId: 'gemini-2.0-flash',              name: 'Gemini 2.0 Flash',              contextWindow: 1048576, inputPrice: 0.1,  outputPrice: 0.4, capabilities: ['chat', 'vision', 'function-calling'] },
  ]

  const seedModels = async (providerId: string, models: ModelSeed[]) => {
    for (const m of models) {
      await prisma.model.upsert({
        where: { providerId_modelId: { providerId, modelId: m.modelId } },
        update: {
          name: m.name,
          contextWindow: m.contextWindow,
          inputPrice: m.inputPrice,
          outputPrice: m.outputPrice,
          capabilities: m.capabilities,
        },
        create: { providerId, ...m, isCustom: false },
      })
    }
  }

  await seedModels(openai.id, openaiModels)
  console.log(`✅ OpenAI models upserted: ${openaiModels.length}`)
  await seedModels(anthropic.id, anthropicModels)
  console.log(`✅ Anthropic models upserted: ${anthropicModels.length}`)
  await seedModels(google.id, googleModels)
  console.log(`✅ Google models upserted: ${googleModels.length}`)

  // 4. Create demo project with default environments
  const demoProject = await prisma.project.upsert({
    where: { slug: 'demo-project' },
    update: {},
    create: {
      name: 'Demo Project',
      slug: 'demo-project',
      description: '기본 데모 프로젝트',
      visibility: 'private',
      members: {
        create: [
          { name: admin.name, email: admin.email, role: 'admin', status: 'active', joinedAt: new Date() },
        ],
      },
    },
  })
  console.log(`✅ Demo project created: ${demoProject.slug}`)

  await prisma.deploymentEnvironment.createMany({
    skipDuplicates: true,
    data: [
      { projectId: demoProject.id, slug: 'dev',     name: 'Development', color: 'blue',    order: 0 },
      { projectId: demoProject.id, slug: 'staging', name: 'Staging',     color: 'amber',   order: 1 },
      { projectId: demoProject.id, slug: 'prod',    name: 'Production',  color: 'emerald', order: 2 },
    ],
  })
  console.log('✅ Default environments created: dev, staging, prod')

  const rrnMaskingSkill = await prisma.skill.upsert({
    where: { userId_name: { userId: admin.id, name: '주민등록 마스킹 검증' } },
    update: {
      enabled: true,
      description: '주민등록등본/초본에서 주민등록번호 마스킹 상태를 확인합니다.',
      instructions: `당신은 HR 문서 검증 보조 Skill입니다.

입력으로 gmail_parse_pdf_attachment 또는 pdf_parse 결과(JSON)가 주어집니다.

규칙:
- doc_type 이 '주민등록등본' 또는 '주민등록초본' 인 경우에만 판단합니다.
- parse.extracted.masking_status 값을 확인합니다.
- masking_status 가 '전체_마스킹' 이면 OK, 그 외(없음/부분/미마스킹 등)면 NOK 입니다.

반환 형식:
아래 JSON만 출력하세요.
{"doc_type": "...", "masking_ok": true|false, "masking_status": "...", "reason": "..."}`,
      allowedTools: [],
    },
    create: {
      userId: admin.id,
      name: '주민등록 마스킹 검증',
      description: '주민등록등본/초본에서 주민등록번호 마스킹 상태를 확인합니다.',
      instructions: `당신은 HR 문서 검증 보조 Skill입니다.

입력으로 gmail_parse_pdf_attachment 또는 pdf_parse 결과(JSON)가 주어집니다.

규칙:
- doc_type 이 '주민등록등본' 또는 '주민등록초본' 인 경우에만 판단합니다.
- parse.extracted.masking_status 값을 확인합니다.
- masking_status 가 '전체_마스킹' 이면 OK, 그 외(없음/부분/미마스킹 등)면 NOK 입니다.

반환 형식:
아래 JSON만 출력하세요.
{"doc_type": "...", "masking_ok": true|false, "masking_status": "...", "reason": "..."}`,
      enabled: true,
      allowedTools: [],
    },
  })
  console.log(`✅ Skill ready: ${rrnMaskingSkill.name}`)

  // 6. Create demo agents: 2 subagents + 1 parent orchestrator
  const searchAgent = await prisma.agent.upsert({
    where: { projectId_slug: { projectId: demoProject.id, slug: 'search-agent-demo' } },
    update: {},
    create: {
      projectId: demoProject.id,
      name: '정보 검색 에이전트',
      slug: 'search-agent-demo',
      description: '주어진 주제에 대해 관련 정보를 수집하고 명확하게 요약하는 전문 에이전트',
      type: 'worker',
      architecture: 'react',
      systemPrompt: `당신은 정보 검색 전문 에이전트입니다.
주어진 질문이나 주제에 대해 체계적으로 정보를 수집하고, 핵심 내용을 명확하게 요약해 전달하세요.
응답은 항상 한국어로 작성합니다.`,
      modelId: 'gpt-4o-mini',
      toolIds: [],
      mcpServerIds: [],
      config: { temperature: 0.3 },
      enabled: true,
    },
  })
  console.log(`✅ Subagent created: ${searchAgent.name}`)

  const codeAgent = await prisma.agent.upsert({
    where: { projectId_slug: { projectId: demoProject.id, slug: 'code-agent-demo' } },
    update: {},
    create: {
      projectId: demoProject.id,
      name: '코드 작성 에이전트',
      slug: 'code-agent-demo',
      description: '요구사항에 맞는 코드를 작성하고 설명하는 전문 에이전트',
      type: 'worker',
      architecture: 'react',
      systemPrompt: `당신은 코드 작성 전문 에이전트입니다.
주어진 요구사항에 맞는 코드를 작성하고, 코드의 동작 원리를 명확하게 설명하세요.
코드는 항상 주석과 함께 제공하며, 응답은 한국어로 작성합니다.`,
      modelId: 'gpt-4o-mini',
      toolIds: [],
      mcpServerIds: [],
      config: { temperature: 0.1 },
      enabled: true,
    },
  })
  console.log(`✅ Subagent created: ${codeAgent.name}`)

  // Parent orchestrator with both subagents
  await prisma.agent.upsert({
    where: { projectId_slug: { projectId: demoProject.id, slug: 'orchestrator-demo' } },
    update: {
      skillIds: [rrnMaskingSkill.id],
      planningConfig: {
        subAgents: {
          enabled: true,
          agentIds: [searchAgent.id, codeAgent.id],
          maxConcurrent: 2,
          delegationStrategy: 'capability_based',
        },
      },
    },
    create: {
      projectId: demoProject.id,
      name: '멀티에이전트 오케스트레이터',
      slug: 'orchestrator-demo',
      description: '검색·코딩 하위 에이전트를 조율하여 복잡한 작업을 처리하는 오케스트레이터',
      type: 'single',
      architecture: 'react',
      systemPrompt: `당신은 멀티에이전트 오케스트레이터입니다.
복잡한 작업을 받으면 전문 하위 에이전트에게 적절히 위임하여 처리합니다.

사용 가능한 하위 에이전트:
- search_agent_demo: 정보 검색 및 요약 전문
- code_agent_demo: 코드 작성 및 설명 전문

작업 유형에 따라 적절한 에이전트에 위임하거나, 간단한 질문은 직접 처리하세요.
응답은 항상 한국어로 작성합니다.`,
      modelId: 'gpt-4o-mini',
      toolIds: [],
      mcpServerIds: [],
      skillIds: [rrnMaskingSkill.id],
      config: { temperature: 0.5 },
      planningConfig: {
        subAgents: {
          enabled: true,
          agentIds: [searchAgent.id, codeAgent.id],
          maxConcurrent: 2,
          delegationStrategy: 'capability_based',
        },
      },
      enabled: true,
    },
  })
  console.log('✅ Orchestrator agent created with 2 subagents')

  await seedCardDefinitions()

  console.log('\n🎉 Seed completed!')
  console.log('📧 Login: admin@example.com / password')
}

async function seedCardDefinitions() {
  const cardsDir = path.resolve(__dirname, '../../../apps/api/src/system-seeds/cards')
  if (!fs.existsSync(cardsDir)) {
    console.log(`⚠️  Card seeds directory not found: ${cardsDir}`)
    return
  }
  const cardFiles = fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json'))
  for (const file of cardFiles) {
    const raw = fs.readFileSync(path.join(cardsDir, file), 'utf-8')
    const def = JSON.parse(raw) as {
      cardId: string
      version: number
      name: string
      category?: string
      payload: unknown
      sampleData?: unknown
    }
    await prisma.cardDefinition.upsert({
      where: { cardId_version: { cardId: def.cardId, version: def.version } },
      update: {
        name: def.name,
        category: def.category ?? 'response',
        payload: def.payload as object,
        sampleData: (def.sampleData ?? {}) as object,
      },
      create: {
        cardId: def.cardId,
        version: def.version,
        name: def.name,
        category: def.category ?? 'response',
        payload: def.payload as object,
        sampleData: (def.sampleData ?? {}) as object,
      },
    })
    console.log(`✅ Card seeded: ${def.cardId}@v${def.version}`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
