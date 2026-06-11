import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateToolDto } from './dto/create-tool.dto'
import { BUILTIN_GROUPS, BUILTIN_TOOL_IDS } from './builtin-catalog'
import * as yaml from 'js-yaml'
import { spawn } from 'child_process'
import OpenAI from 'openai'
import { AiGenerateDto } from './dto/ai-generate.dto'
import { InternalVisionAnalyzeDto } from './dto/internal-vision-analyze.dto'

import { decryptString, encryptString } from '../../common/crypto'
import { decryptCredential } from '../../common/credential-cipher'

interface HttpToolConfig {
  url: string
  method?: string
  headers?: Record<string, string>
  auth?: { type: string; value?: string; headerName?: string }
  bodyTemplate?: string
}

interface CodeToolConfig {
  code: string
  language?: 'javascript' | 'python'
  timeout?: number
}

// ... (rest of interfaces)

// ============================================================
// Tool Group DTOs (inline)
// ============================================================

interface CreateToolGroupDto {
  name: string
  description?: string
  type: 'rest' | 'code'
}

// ============================================================
// OpenAPI types (minimal)
// ============================================================

interface OpenApiPath {
  summary?: string
  description?: string
  operationId?: string
  parameters?: Array<{
    name: string
    in: 'path' | 'query' | 'header' | 'cookie'
    description?: string
    required?: boolean
    schema?: any
  }>
  requestBody?: {
    content?: Record<string, { schema?: any }>
  }
  responses?: Record<string, {
    description?: string
    content?: Record<string, { schema?: any }>
  }>
}

interface OpenApiSpec {
  openapi?: string
  swagger?: string
  info?: { title?: string; description?: string }
  servers?: Array<{ url: string }>
  paths?: Record<string, Record<string, OpenApiPath>>
  components?: {
    schemas?: Record<string, any>
  }
  // Swagger 2.0 fields
  host?: string
  schemes?: string[]
  basePath?: string
  definitions?: Record<string, any>
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'tool'
}

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Vision 분석용 OpenAI 호환 provider를 선택한다.
   * 우선순위: endpoint가 null(OpenAI 기본) → endpoint에 'anthropic' 미포함 → 전체 fallback
   */
  private async _resolveVisionProvider() {
    const allProviders = await this.prisma.provider.findMany({
      where: { apiKeyConfigured: true },
      orderBy: { createdAt: 'asc' },
    })

    if (allProviders.length === 0) return null

    // 1순위: endpoint가 null (OpenAI 기본값)
    const nullEndpoint = allProviders.find(p => p.endpoint === null)
    if (nullEndpoint) return nullEndpoint

    // 2순위: endpoint에 anthropic이 없는 것
    const nonAnthropic = allProviders.find(p => p.endpoint && !p.endpoint.includes('anthropic'))
    if (nonAnthropic) return nonAnthropic

    // fallback: 전체 중 첫 번째
    return allProviders[0]
  }

  async internalVisionAnalyze(dto: InternalVisionAnalyzeDto): Promise<{ content: string }> {
    const provider = await this._resolveVisionProvider()

    if (!provider || !provider.apiKeyEncrypted) {
      throw new BadRequestException('설정된 AI 프로바이더가 없습니다. 설정 > 프로바이더 메뉴에서 API 키를 등록해주세요.')
    }

    // apiKeyEncrypted는 암호화된 값 → 복호화 후 사용
    let apiKey: string
    try {
      apiKey = decryptString(provider.apiKeyEncrypted)
    } catch {
      // 복호화 실패 시 평문으로 저장된 경우 그대로 사용 (레거시 호환)
      apiKey = provider.apiKeyEncrypted
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: provider.endpoint ?? undefined,
    })

    const modelId = dto.model ?? 'gpt-4o-mini'
    const imageUrl = `data:${dto.mime_type};base64,${dto.image_base64}`

    try {
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: dto.prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.0,
      })

      const content = completion.choices[0]?.message?.content?.trim() ?? ''
      return { content }
    } catch (err) {
      throw new BadRequestException(`Vision analyze 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async getPdfParseRulesByAgentId(agentId: string): Promise<unknown[]> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { config: true },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const cfg = (agent.config as Record<string, unknown>) ?? {}
    const rules = cfg.pdfParseRules
    return Array.isArray(rules) ? (rules as unknown[]) : []
  }

  async savePdfParseRulesByAgentId(agentId: string, rules: unknown): Promise<{ success: true }> {
    if (!Array.isArray(rules)) throw new BadRequestException('rules must be an array')

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { config: true },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const cfg = (agent.config as Record<string, unknown>) ?? {}

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { config: { ...cfg, pdfParseRules: rules as unknown[] } as object },
    })

    return { success: true }
  }

  async clearPdfParseRulesByAgentId(agentId: string): Promise<{ success: true }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { config: true },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const cfg = (agent.config as Record<string, unknown>) ?? {}
    const { pdfParseRules: _removed, ...rest } = cfg

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { config: rest as object },
    })

    return { success: true }
  }

  async aiGenerate(dto: AiGenerateDto) {
    const provider = await this.prisma.provider.findFirst({
      where: { apiKeyConfigured: true },
      orderBy: { type: 'asc' } // 'cloud' (OpenAI 등) 우선
    })

    if (!provider || !provider.apiKeyEncrypted) {
      throw new BadRequestException('설정된 AI 프로바이더가 없습니다. 설정 > 프로바이더 메뉴에서 API 키를 등록해주세요.')
    }

    let apiKey: string
    try {
      apiKey = decryptString(provider.apiKeyEncrypted)
    } catch {
      apiKey = provider.apiKeyEncrypted
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: provider.endpoint ?? undefined,
    })

    const modelId = 'gpt-4o-mini' // 기본 모델

    let systemPrompt = ''
    let userPrompt = ''

    switch (dto.target) {
      case 'description':
        systemPrompt = '당신은 전문적인 API 문서 작성자입니다. 주어진 도구 이름과 타입을 바탕으로 간결하고 명확한 설명을 작성하세요.'
        userPrompt = `도구 이름: ${dto.name}\n도구 타입: ${dto.type}\n추가 힌트: ${dto.prompt ?? '없음'}\n\n결과는 한 문장의 한국어 설명으로만 답변하세요.`
        break
      case 'inputSchema':
        systemPrompt = '주어진 도구의 이름과 설명을 바탕으로 JSON Schema(Draft 7)를 생성하세요. properties와 required 필드를 포함한 object 타입이어야 합니다.'
        userPrompt = `도구 이름: ${dto.name}\n설명: ${dto.description}\n바디 템플릿: ${dto.bodyTemplate ?? '없음'}\n추가 힌트: ${dto.prompt ?? '없음'}\n\n결과는 유효한 JSON Schema 형식으로만 답변하세요. 마크다운 기호 없이 JSON 내용만 출력하세요.`
        break
      case 'outputSchema':
        systemPrompt = '도구의 설명과 목적을 바탕으로 예상되는 응답 데이터의 JSON Schema(Draft 7)를 생성하세요.'
        userPrompt = `도구 이름: ${dto.name}\n설명: ${dto.description}\n추가 힌트: ${dto.prompt ?? '없음'}\n\n결과는 유효한 JSON Schema 형식으로만 답변하세요. 마크다운 기호 없이 JSON 내용만 출력하세요.`
        break
      case 'bodyTemplate':
        systemPrompt = '주어진 입력 스키마와 설명을 바탕으로 HTTP Request Body로 사용할 JSON 템플릿을 생성하세요. {{변수명}} 형식을 사용하여 스키마의 속성을 참조하세요.'
        userPrompt = `도구 이름: ${dto.name}\n설명: ${dto.description}\n입력 스키마: ${JSON.stringify(dto.inputSchema)}\n추가 힌트: ${dto.prompt ?? '없음'}\n\n결과는 유효한 JSON 템플릿 형식으로만 답변하세요. 마크다운 기호 없이 JSON 내용만 출력하세요.`
        break
      case 'schemaFromTemplate':
        systemPrompt = '주어진 JSON 템플릿에서 {{변수}} 형태의 변수들을 추출하여, 이 변수들을 속성으로 가지는 JSON Schema(Draft 7)를 생성하세요. 각 변수의 타입과 설명을 문맥에 맞게 추론하세요.'
        userPrompt = `JSON 템플릿: ${dto.bodyTemplate}\n추가 힌트: ${dto.prompt ?? '없음'}\n\n결과는 유효한 JSON Schema 형식으로만 답변하세요. 마크다운 기호 없이 JSON 내용만 출력하세요.`
        break
    }

    try {
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
      })

      const content = completion.choices[0].message.content?.trim() || ''
      
      // JSON 형태인 경우 파싱 시도 (마크다운 코드 블록 제거)
      if (['inputSchema', 'outputSchema', 'bodyTemplate', 'schemaFromTemplate'].includes(dto.target)) {
        const jsonMatch = content.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        try {
          return { result: JSON.parse(jsonStr) }
        } catch {
          return { result: content }
        }
      }

      return { result: content }
    } catch (err) {
      throw new BadRequestException(`AI 생성 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ============================================================
  // Tool CRUD (legacy + group-aware)
  // ============================================================

  async list(projectId: string) {
    return this.prisma.tool.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getById(id: string) {
    const tool = await this.prisma.tool.findUnique({ where: { id } })
    if (!tool) throw new NotFoundException('Tool not found')
    return tool
  }

  async create(projectId: string, dto: CreateToolDto, groupId?: string) {
    const slug = dto.slug ?? slugify(dto.name)
    const existing = await this.prisma.tool.findFirst({
      where: { projectId, slug },
    })
    if (existing) throw new ConflictException('Slug already exists in this project')

    return this.prisma.tool.create({
      data: {
        projectId,
        groupId: groupId ?? dto.groupId ?? null,
        name: dto.name,
        slug,
        description: dto.description ?? '',
        type: dto.type,
        config: dto.config as object,
        inputSchema: dto.inputSchema as object,
        outputSchema: dto.outputSchema as object,
        labels: (dto.labels as object | undefined) ?? Prisma.JsonNull,
        enabled: true,
      },
    })
  }

  async update(id: string, dto: Partial<CreateToolDto>) {
    await this.getById(id)
    return this.prisma.tool.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.config !== undefined && { config: dto.config as object }),
        ...(dto.inputSchema !== undefined && { inputSchema: dto.inputSchema as object }),
        ...(dto.outputSchema !== undefined && { outputSchema: dto.outputSchema as object }),
        ...(dto.labels !== undefined && {
          labels: dto.labels === null ? Prisma.JsonNull : (dto.labels as object),
        }),
      },
    })
  }

  async toggle(id: string) {
    const tool = await this.getById(id)
    return this.prisma.tool.update({
      where: { id },
      data: { enabled: !tool.enabled },
    })
  }

  async delete(id: string) {
    await this.getById(id)
    await this.prisma.tool.delete({ where: { id } })
    return { success: true }
  }

  async getGmailOAuthAppConfig(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const configs = (project.builtinConfigs as Record<string, any>) ?? {}
    const gmailCfg = configs.gmail_connect ?? configs.gmail_search ?? {}

    return {
      clientId: (gmailCfg.oauthClientId as string | undefined) || '',
      redirectUri: (gmailCfg.oauthRedirectUri as string | undefined) || '',
      scopes: (gmailCfg.oauthScopes as string[] | undefined) || [],
      hasClientSecret: !!(gmailCfg.oauthClientSecretEncrypted as string | undefined),
    }
  }

  async clearGmailOAuthAppConfig(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const existing = (project.builtinConfigs as Record<string, any>) ?? {}
    if (!existing.gmail_connect && !existing.gmail_search) {
      return { success: true }
    }

    const { gmail_connect, gmail_search, ...rest } = existing
    await this.prisma.project.update({
      where: { id: projectId },
      data: { builtinConfigs: rest as Prisma.InputJsonValue },
    })

    return { success: true }
  }

  // ============================================================
  // Tool Groups CRUD
  // ============================================================

  async listGroups(projectId: string) {
    return this.prisma.toolGroup.findMany({
      where: { projectId },
      include: { tools: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createGroup(projectId: string, dto: CreateToolGroupDto) {
    return this.prisma.toolGroup.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description ?? '',
        type: dto.type,
        enabled: true,
      },
      include: { tools: true },
    })
  }

  async updateGroup(id: string, dto: Partial<CreateToolGroupDto> & { enabled?: boolean }) {
    const group = await this.prisma.toolGroup.findUnique({ where: { id } })
    if (!group) throw new NotFoundException('Tool group not found')
    return this.prisma.toolGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: { tools: true },
    })
  }

  async deleteGroup(id: string) {
    const group = await this.prisma.toolGroup.findUnique({ where: { id } })
    if (!group) throw new NotFoundException('Tool group not found')
    await this.prisma.toolGroup.delete({ where: { id } })
    return { success: true }
  }

  async listGroupTools(groupId: string) {
    const group = await this.prisma.toolGroup.findUnique({ where: { id: groupId } })
    if (!group) throw new NotFoundException('Tool group not found')
    return this.prisma.tool.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async addToolToGroup(groupId: string, dto: CreateToolDto) {
    const group = await this.prisma.toolGroup.findUnique({ where: { id: groupId } })
    if (!group) throw new NotFoundException('Tool group not found')
    return this.create(group.projectId, dto, groupId)
  }

  // ============================================================
  // OpenAPI Import / Export
  // ============================================================

  async analyzeOpenApi(spec: string, format: 'json' | 'yaml', baseUrlOverride?: string) {
    let parsed: OpenApiSpec
    try {
      parsed = format === 'yaml' ? (yaml.load(spec) as OpenApiSpec) : JSON.parse(spec)
    } catch {
      throw new BadRequestException('OpenAPI 스펙 파싱에 실패했습니다')
    }
    return this.parseSpecToToolData(parsed, baseUrlOverride)
  }

  async analyzeOpenApiByUrl(url: string, baseUrlOverride?: string) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch spec: ${res.statusText}`)
      const text = await res.text()
      let parsed: OpenApiSpec
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = yaml.load(text) as OpenApiSpec
      }

      let finalBaseUrl = baseUrlOverride
      if (!finalBaseUrl) {
        const specUrl = parsed.servers?.[0]?.url || (parsed.host ? `${parsed.schemes?.[0] || 'https'}://${parsed.host}${parsed.basePath || ''}` : '')
        
        try {
          const fetchUrl = new URL(url)
          const origin = `${fetchUrl.protocol}//${fetchUrl.host}`
          
          if (!specUrl) {
            finalBaseUrl = origin
          } else if (specUrl.startsWith('http')) {
            finalBaseUrl = specUrl
          } else {
            finalBaseUrl = new URL(specUrl, origin).toString()
          }
        } catch (_e) {
          finalBaseUrl = specUrl || ''
        }
      }

      return this.parseSpecToToolData(parsed, finalBaseUrl)
    } catch (err) {
      throw new BadRequestException(`스펙 분석 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private resolveSchema(schema: any, components?: any, visited = new Set<string>()): any {
    if (!schema) return { type: 'object' }
    
    if (schema.$ref) {
      const refKey = schema.$ref
      if (visited.has(refKey)) return { type: 'object', description: 'Circular reference' }
      const nextVisited = new Set(visited).add(refKey)
      
      const refPath = schema.$ref.split('/')
      const refName = refPath[refPath.length - 1]
      const resolved = components?.[refName]
      if (resolved) return this.resolveSchema(resolved, components, nextVisited)
      return { type: 'object' }
    }

    if (schema.allOf && Array.isArray(schema.allOf)) {
      const merged: any = { type: 'object', properties: {}, required: [] }
      for (const sub of schema.allOf) {
        const resolvedSub = this.resolveSchema(sub, components, visited)
        if (resolvedSub.properties) {
          merged.properties = { ...merged.properties, ...resolvedSub.properties }
        }
        if (resolvedSub.required) {
          merged.required = [...new Set([...merged.required, ...resolvedSub.required])]
        }
      }
      return merged
    }

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type

    if (type === 'array' || schema.items) {
      return {
        type: 'array',
        items: schema.items ? this.resolveSchema(schema.items, components, visited) : { type: 'string' },
        description: schema.description
      }
    }

    if (type === 'object' || schema.properties || schema.additionalProperties) {
      const properties: Record<string, any> = {}
      if (schema.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
          properties[k] = this.resolveSchema(v, components, visited)
        }
      }
      return {
        type: 'object',
        properties: Object.keys(properties).length > 0 ? properties : undefined,
        required: schema.required || [],
        description: schema.description,
        additionalProperties: schema.additionalProperties === true ? true : 
          (schema.additionalProperties ? this.resolveSchema(schema.additionalProperties, components, visited) : undefined)
      }
    }

    return {
      type: type || 'string',
      description: schema.description,
      enum: schema.enum,
      format: schema.format,
      default: schema.default,
      nullable: schema.nullable
    }
  }

  private generateJsonTemplate(schema: any, components?: any): string {
    const resolved = this.resolveSchema(schema, components)
    
    const buildTemplate = (s: any): any => {
      if (s.type === 'array') {
        return [buildTemplate(s.items || { type: 'string' })]
      }
      if (s.type === 'object' && s.properties) {
        const obj: Record<string, any> = {}
        for (const [k, v] of Object.entries(s.properties as Record<string, any>)) {
          obj[k] = buildTemplate(v)
        }
        return obj
      }
      return `{{${s.description || 'value'}}}`
    }

    if (resolved.type === 'object' && resolved.properties) {
      const template: Record<string, any> = {}
      for (const [key, prop] of Object.entries(resolved.properties as Record<string, any>)) {
        if (prop.type === 'object' || prop.type === 'array') {
          template[key] = `{{${key}}}`
        } else {
          template[key] = `{{${key}}}`
        }
      }
      return JSON.stringify(template, null, 2)
    }

    if (resolved.type === 'array') {
      const itemTemplate = buildTemplate(resolved.items)
      return JSON.stringify([itemTemplate], null, 2).replace(/"{{(\w+)}}"/g, '{{$1}}')
    }

    return '{{body}}'
  }

  private parseSpecToToolData(parsed: OpenApiSpec, baseUrlOverride?: string) {
    if (!parsed?.paths) throw new BadRequestException('paths 섹션이 없습니다')

    const components = parsed.components?.schemas || parsed.definitions || {}
    let baseUrl = baseUrlOverride || parsed.servers?.[0]?.url || ''
    if (!baseUrl && parsed.host) {
      const scheme = parsed.schemes?.[0] || 'https'
      baseUrl = `${scheme}://${parsed.host}${parsed.basePath || ''}`
    }
    baseUrl = baseUrl.replace(/\/+$/, '')

    const tools = []
    for (const [path, methods] of Object.entries(parsed.paths)) {
      for (const [method, op] of Object.entries(methods) as Array<[string, OpenApiPath]>) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const name = op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`
          const description = op.description ?? op.summary ?? ''
          const slug = slugify(op.operationId ?? `${method}_${path.replace(/\//g, '_')}`)

          const inputProperties: Record<string, any> = {}
          const inputRequired: string[] = []
          
          let finalPath = path
          const queryParams: string[] = []
          
          for (const param of op.parameters ?? []) {
            const resolvedParamSchema = this.resolveSchema(param.schema, components)
            inputProperties[param.name] = {
              ...resolvedParamSchema,
              description: param.description || resolvedParamSchema.description || param.name
            }
            if (param.required) inputRequired.push(param.name)

            if (param.in === 'path') {
              finalPath = finalPath.replace(`{${param.name}}`, `{{${param.name}}}`)
            } else if (param.in === 'query') {
              queryParams.push(`${param.name}={{${param.name}}}`)
            }
          }

          if (queryParams.length > 0) {
            finalPath += (finalPath.includes('?') ? '&' : '?') + queryParams.join('&')
          }

          let bodyTemplate = ''
          const bodyContent = op.requestBody?.content
          if (bodyContent) {
            const jsonContent = bodyContent['application/json'] || Object.values(bodyContent)[0]
            if (jsonContent?.schema) {
              const resolvedBodySchema = this.resolveSchema(jsonContent.schema, components)
              
              if (resolvedBodySchema.type === 'object' && resolvedBodySchema.properties) {
                for (const [k, v] of Object.entries(resolvedBodySchema.properties)) {
                  if (!inputProperties[k]) {
                    inputProperties[k] = v
                    if (resolvedBodySchema.required?.includes(k)) inputRequired.push(k)
                  }
                }
              } else if (resolvedBodySchema.type === 'array') {
                if (!inputProperties['body']) {
                  inputProperties['body'] = resolvedBodySchema
                  inputRequired.push('body')
                }
              } else {
                if (!inputProperties['body']) {
                  inputProperties['body'] = resolvedBodySchema
                  inputRequired.push('body')
                }
              }
              bodyTemplate = this.generateJsonTemplate(jsonContent.schema, components)
            }
          }

          let outputSchema: any = { type: 'object' }
          const responses = op.responses || {}
          const successResponse = responses['200'] || responses['201'] || responses['default']
          if (successResponse?.content) {
            const jsonOutput = successResponse.content['application/json'] || Object.values(successResponse.content)[0]
            if (jsonOutput?.schema) {
              outputSchema = this.resolveSchema(jsonOutput.schema, components)
            }
          }

          tools.push({
            name,
            slug,
            description,
            type: 'http',
            config: { 
              url: `${baseUrl}${finalPath}`, 
              method: method.toUpperCase(),
              bodyTemplate: bodyTemplate || undefined
            },
            inputSchema: { type: 'object', properties: inputProperties, required: inputRequired },
            outputSchema,
          })
        }
      }
    }
    return tools
  }

  // ============================================================
  // Integration (원클릭 연동 서비스 등록 / 동기화)
  // ============================================================

  async registerIntegration(
    projectId: string,
    dto: {
      name: string
      specUrl: string
      baseUrlOverride?: string
      auth?: { type: 'none' | 'bearer' | 'api_key'; value?: string; headerName?: string }
    },
  ) {
    const tools = await this.analyzeOpenApiByUrl(dto.specUrl, dto.baseUrlOverride)
    const authConfig =
      !dto.auth || dto.auth.type === 'none' ? null : (dto.auth as object)

    const group = await this.prisma.toolGroup.create({
      data: {
        projectId,
        name: dto.name,
        description: '',
        type: 'rest',
        enabled: true,
        specUrl: dto.specUrl,
        ...(authConfig ? { authConfig } : {}),
      },
      include: { tools: true },
    })

    const toolsWithAuth = this.injectAuthToTools(tools, dto.auth)
    await this.batchImportTools(projectId, group.id, toolsWithAuth, 'reset')

    return this.prisma.toolGroup.findUnique({
      where: { id: group.id },
      include: { tools: { orderBy: { createdAt: 'asc' } } },
    })
  }

  async syncIntegration(groupId: string) {
    const group = await this.prisma.toolGroup.findUnique({ where: { id: groupId } })
    if (!group) throw new NotFoundException('Tool group not found')
    if (!group.specUrl) throw new BadRequestException('이 Tool Group에 연동된 spec URL이 없습니다')

    const auth = group.authConfig as { type: string; value?: string; headerName?: string } | null
    const tools = await this.analyzeOpenApiByUrl(group.specUrl)
    const toolsWithAuth = this.injectAuthToTools(tools, auth ?? undefined)
    await this.batchImportTools(group.projectId, groupId, toolsWithAuth, 'reset')

    return this.prisma.toolGroup.findUnique({
      where: { id: groupId },
      include: { tools: { orderBy: { createdAt: 'asc' } } },
    })
  }

  private injectAuthToTools(
    tools: any[],
    auth?: { type: string; value?: string; headerName?: string } | null,
  ): any[] {
    if (!auth || auth.type === 'none' || !auth.value) return tools
    return tools.map((t) => ({
      ...t,
      config: {
        ...(t.config as Record<string, unknown>),
        auth: {
          type: auth.type === 'api_key' ? 'api_key' : 'bearer',
          value: auth.value,
          ...(auth.type === 'api_key' && auth.headerName ? { headerName: auth.headerName } : {}),
        },
      },
    }))
  }

  async batchImportTools(projectId: string, groupId: string, tools: any[], mode: 'update' | 'reset') {
    const group = await this.prisma.toolGroup.findUnique({ where: { id: groupId } })
    if (!group) throw new NotFoundException('Tool group not found')
    if (group.projectId !== projectId) throw new BadRequestException('Project ID mismatch')

    if (mode === 'reset') {
      await this.prisma.tool.deleteMany({ where: { groupId } })
    }

    const created = []
    for (const toolData of tools) {
      const { projectId: _, groupId: __, ...cleanedToolData } = toolData

      if (mode === 'update') {
        const existing = await this.prisma.tool.findFirst({
          where: { projectId, slug: cleanedToolData.slug },
        })
        if (existing) await this.prisma.tool.delete({ where: { id: existing.id } })
      } else {
        let finalSlug = cleanedToolData.slug
        let attempt = 1
        while (await this.prisma.tool.findFirst({ where: { projectId, slug: finalSlug } })) {
          finalSlug = `${cleanedToolData.slug}_${attempt++}`
        }
        cleanedToolData.slug = finalSlug
      }

      const tool = await this.prisma.tool.create({
        data: {
          ...cleanedToolData,
          projectId,
          groupId,
          enabled: true,
        },
      })
      created.push(tool)
    }
    return created
  }

  async exportOpenApi(groupId: string, format: 'json' | 'yaml') {
    const group = await this.prisma.toolGroup.findUnique({
      where: { id: groupId },
      include: { tools: { where: { enabled: true }, orderBy: { createdAt: 'asc' } } },
    })
    if (!group) throw new NotFoundException('Tool group not found')

    const paths: Record<string, Record<string, unknown>> = {}

    for (const tool of group.tools) {
      const cfg = tool.config as Record<string, unknown>
      const path = (cfg.url as string | undefined) ?? `/${tool.slug}`
      const method = ((cfg.method as string | undefined) ?? 'POST').toLowerCase()
      const inputSchema = tool.inputSchema as Record<string, unknown>

      if (!paths[path]) paths[path] = {}
      paths[path][method] = {
        summary: tool.name,
        description: tool.description,
        operationId: tool.slug,
        requestBody: method !== 'get' ? {
          required: true,
          content: { 'application/json': { schema: inputSchema } },
        } : undefined,
        parameters: method === 'get' ? this.schemaToQueryParams(inputSchema) : [],
        responses: { '200': { description: 'Success' } },
      }
    }

    const spec = {
      openapi: '3.0.0',
      info: { title: group.name, description: group.description, version: '1.0.0' },
      paths,
    }

    if (format === 'yaml') {
      return yaml.dump(spec)
    }
    return JSON.stringify(spec, null, 2)
  }

  private schemaToQueryParams(schema: Record<string, unknown>) {
    const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
    const required = (schema.required as string[]) ?? []
    return Object.entries(props).map(([name, def]) => ({
      name,
      in: 'query',
      description: def.description ?? name,
      required: required.includes(name),
      schema: { type: def.type ?? 'string' },
    }))
  }

  // ============================================================
  // Built-in Tools
  // ============================================================

  async getBuiltin(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { enabledBuiltins: true, builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const enabledSet = new Set(project.enabledBuiltins)
    const configs = (project.builtinConfigs as Record<string, any>) ?? {}

    const gmailConnected = !!(
      configs.gmail_connect?.refreshTokenEncrypted
      || configs.gmail_search?.refreshTokenEncrypted
    )

    return BUILTIN_GROUPS.map((group) => ({
      ...group,
      tools: group.tools.map((tool) => ({
        ...tool,
        enabled: enabledSet.has(tool.id),
        configured: !tool.requiresConfig
          ? (
              tool.id === 'gmail_connect' ||
              tool.id === 'gmail_search' ||
              tool.id === 'gmail_fetch' ||
              tool.id === 'gmail_fetch_attachment' ||
              tool.id === 'gmail_parse_pdf_attachment' ||
              tool.id === 'gmail_send'
            )
            ? gmailConnected
            : true
          : !!(configs[tool.id]?.apiKey),
      })),
    }))
  }

  // ============================================================
  // Gmail OAuth (Built-in)
  // ============================================================

  private get defaultGmailScopes() {
    const raw = this.configService.get<string>('GMAIL_OAUTH_SCOPES')
    if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean)
    // gmail.send 스코프 포함 — 메일 발송을 위해 필요
    return [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ]
  }

  private async resolveGmailOAuthConfig(projectId: string): Promise<{
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes: string[]
  }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const configs = (project.builtinConfigs as Record<string, any>) ?? {}
    const gmailCfg = configs.gmail_connect ?? configs.gmail_search ?? {}

    const storedClientId = (gmailCfg.oauthClientId as string | undefined) || ''
    const storedSecretEnc = (gmailCfg.oauthClientSecretEncrypted as string | undefined) || ''
    const storedRedirectUri = (gmailCfg.oauthRedirectUri as string | undefined) || ''
    const storedScopes = (gmailCfg.oauthScopes as string[] | undefined) || undefined

    if (storedClientId && storedSecretEnc && storedRedirectUri) {
      return {
        clientId: storedClientId,
        clientSecret: decryptString(storedSecretEnc),
        redirectUri: storedRedirectUri,
        scopes: storedScopes && storedScopes.length > 0 ? storedScopes : this.defaultGmailScopes,
      }
    }

    const envClientId = this.configService.get<string>('GMAIL_OAUTH_CLIENT_ID') || ''
    const envClientSecret = this.configService.get<string>('GMAIL_OAUTH_CLIENT_SECRET') || ''
    const envRedirectUri = this.configService.get<string>('GMAIL_OAUTH_REDIRECT_URI') || ''
    if (!envClientId || !envClientSecret || !envRedirectUri) {
      throw new BadRequestException('Gmail OAuth 환경변수가 설정되지 않았습니다 (GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)')
    }

    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri,
      scopes: this.defaultGmailScopes,
    }
  }

  async saveGmailOAuthAppConfig(
    projectId: string,
    config: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] },
  ) {
    if (!config.clientId?.trim()) throw new BadRequestException('clientId is required')
    if (!config.redirectUri?.trim()) throw new BadRequestException('redirectUri is required')

    const redirectUri = config.redirectUri.trim()
    if (!redirectUri.startsWith('http://') && !redirectUri.startsWith('https://')) {
      throw new BadRequestException('redirectUri must start with http:// or https://')
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const existing = (project.builtinConfigs as Record<string, any>) ?? {}

    const currentSecretEnc = (existing.gmail_connect?.oauthClientSecretEncrypted as string | undefined)
      || (existing.gmail_search?.oauthClientSecretEncrypted as string | undefined)
    const nextSecretRaw = config.clientSecret?.trim()
    const oauthClientSecretEncrypted = nextSecretRaw
      ? encryptString(nextSecretRaw)
      : currentSecretEnc

    if (!oauthClientSecretEncrypted) {
      throw new BadRequestException('clientSecret is required')
    }

    const updated = {
      ...existing,
      gmail_connect: {
        ...(existing.gmail_connect ?? existing.gmail_search ?? {}),
        oauthClientId: config.clientId.trim(),
        oauthClientSecretEncrypted,
        oauthRedirectUri: redirectUri,
        oauthScopes: (config.scopes ?? []).map((s) => s.trim()).filter(Boolean),
        oauthConfiguredAt: new Date().toISOString(),
      },
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { builtinConfigs: updated as Prisma.InputJsonValue },
    })

    return { success: true }
  }

  async getGmailAuthUrl(projectId: string, userId: string) {
    const oauth = await this.resolveGmailOAuthConfig(projectId)

    const stateRaw = JSON.stringify({ projectId, userId, ts: Date.now() })
    const state = Buffer.from(stateRaw, 'utf-8').toString('base64url')

    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: 'code',
      scope: oauth.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    })

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
  }

  private parseState(state: string) {
    try {
      const raw = Buffer.from(state, 'base64url').toString('utf-8')
      const parsed = JSON.parse(raw) as { projectId: string; userId: string; ts: number }
      if (!parsed?.projectId || !parsed?.userId) throw new Error('invalid state')
      return parsed
    } catch {
      throw new BadRequestException('Invalid state')
    }
  }

  async exchangeGmailCode(code: string, state: string, userId: string) {
    const parsed = this.parseState(state)
    if (parsed.userId !== userId) {
      throw new ForbiddenException('OAuth state does not match current user')
    }

    const oauth = await this.resolveGmailOAuthConfig(parsed.projectId)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        redirect_uri: oauth.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    const tokenJson = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok) {
      throw new BadRequestException(tokenJson.error_description || tokenJson.error || 'Token exchange failed')
    }

    const refreshToken = tokenJson.refresh_token as string | undefined
    if (!refreshToken) {
      throw new BadRequestException('refresh_token이 발급되지 않았습니다. Google OAuth 설정에서 access_type=offline 및 prompt=consent가 필요합니다.')
    }

    const refreshTokenEncrypted = encryptString(refreshToken)

    const project = await this.prisma.project.findUnique({
      where: { id: parsed.projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const existing = (project.builtinConfigs as Record<string, any>) ?? {}
    const updated = {
      ...existing,
      gmail_connect: {
        ...(existing.gmail_connect ?? existing.gmail_search ?? {}),
        refreshTokenEncrypted,
        scope: tokenJson.scope,
        tokenType: tokenJson.token_type,
        configuredAt: new Date().toISOString(),
      },
    }

    await this.prisma.project.update({
      where: { id: parsed.projectId },
      data: { builtinConfigs: updated as Prisma.InputJsonValue },
    })

    return { success: true }
  }

  async issueGmailAccessToken(projectId: string) {
    const oauth = await this.resolveGmailOAuthConfig(projectId)

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const configs = (project.builtinConfigs as Record<string, any>) ?? {}
    const enc = (configs.gmail_connect?.refreshTokenEncrypted as string | undefined)
      || (configs.gmail_search?.refreshTokenEncrypted as string | undefined)
    if (!enc) throw new BadRequestException('Gmail이 아직 연동되지 않았습니다')

    const refreshToken = decryptString(enc)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    const tokenJson = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok) {
      throw new BadRequestException(tokenJson.error_description || tokenJson.error || 'Token refresh failed')
    }

    return {
      accessToken: tokenJson.access_token as string,
      expiresIn: tokenJson.expires_in as number | undefined,
      tokenType: tokenJson.token_type as string | undefined,
    }
  }

  async issueGmailAccessTokenByAgentId(
    agentId: string,
    userId?: string,
    source?: 'studio' | 'client',
  ) {
    this.logger.log(
      `Gmail token request: agentId=${agentId}, userId=${userId ?? 'none'}, source=${source ?? 'unspecified'}`,
    )

    // source 가 명시적으로 주어지면 admin/client 자격증명을 절대 섞지 않는다 — 각 페이지에서
    // 따로 인증한 OAuth 만 사용. 폴백 금지.
    if (source === 'studio') {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
        select: { projectId: true },
      })
      if (!agent) throw new NotFoundException('Agent not found')
      this.logger.log(`Gmail token (studio): 프로젝트 OAuth 사용 (projectId=${agent.projectId})`)
      return this.issueGmailAccessToken(agent.projectId)
    }
    if (source === 'client') {
      if (!userId) {
        this.logger.warn(`Gmail token (client): userId 없음 — 사용자 OAuth 사용 불가`)
        throw new BadRequestException(
          'Client 컨텍스트에서 Gmail 도구를 사용하려면 로그인이 필요합니다.',
        )
      }
      const userRow = await this.prisma.userCredential.findFirst({
        where: { userId, kind: 'tool', targetId: 'gmail', label: 'oauth-app' },
        select: { id: true, status: true, metadata: true, lastVerifiedAt: true },
      })
      if (!userRow) {
        this.logger.warn(
          `Gmail token (client): 사용자 ${userId} OAuth 미등록 — 프로젝트 폴백 금지, 명시적 에러`,
        )
        throw new BadRequestException(
          'Gmail 사용자 OAuth 가 등록되어 있지 않습니다. 도구 관리 페이지에서 먼저 Gmail 연결을 진행해 주세요.',
        )
      }
      const meta = (userRow.metadata ?? {}) as { clientId?: string; connectedAt?: string }
      this.logger.log(
        `Gmail token (client): user row 발견 (userId=${userId}, status=${userRow.status}, clientId=${meta.clientId ?? 'none'}, connectedAt=${meta.connectedAt ?? 'none'})`,
      )
      const userToken = await this.tryIssueUserGmailAccessToken(userId)
      if (userToken) {
        this.logger.log(`Gmail token (client): 사용자 ${userId} OAuth 사용 성공`)
        return userToken
      }
      this.logger.warn(
        `Gmail token (client): 사용자 ${userId} access_token 발급 실패 — 프로젝트 폴백 금지`,
      )
      throw new BadRequestException(
        'Gmail 사용자 OAuth 토큰 발급에 실패했습니다. 도구 관리 페이지에서 Gmail 연결을 다시 시도해 주세요.',
      )
    }

    // source 미지정 — 기존 동작 보존 (Backward compatibility)
    // userId 있으면 user OAuth 우선, 없으면 프로젝트 폴백.
    if (userId) {
      const userRow = await this.prisma.userCredential.findFirst({
        where: { userId, kind: 'tool', targetId: 'gmail', label: 'oauth-app' },
        select: { id: true, status: true, metadata: true, lastVerifiedAt: true },
      })
      if (userRow) {
        const meta = (userRow.metadata ?? {}) as { clientId?: string; connectedAt?: string }
        this.logger.log(
          `Gmail token (legacy): user row 발견 (userId=${userId}, status=${userRow.status}, clientId=${meta.clientId ?? 'none'}, connectedAt=${meta.connectedAt ?? 'none'})`,
        )
        const userToken = await this.tryIssueUserGmailAccessToken(userId)
        if (userToken) {
          this.logger.log(`Gmail token (legacy): 사용자 ${userId} OAuth 사용 성공`)
          return userToken
        }
        this.logger.warn(
          `Gmail token (legacy): 사용자 ${userId} 토큰 발급 실패 — 프로젝트 폴백 차단`,
        )
        throw new BadRequestException(
          'Gmail 사용자 OAuth 토큰 발급에 실패했습니다. 도구 관리 페이지에서 Gmail 연결을 다시 시도해 주세요.',
        )
      }
      this.logger.log(
        `Gmail token (legacy): 사용자 ${userId} OAuth 미등록 — 프로젝트 폴백 사용 (agent=${agentId})`,
      )
    }
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { projectId: true },
    })
    if (!agent) throw new NotFoundException('Agent not found')
    this.logger.log(`Gmail token (legacy): 프로젝트 폴백 (projectId=${agent.projectId})`)
    return this.issueGmailAccessToken(agent.projectId)
  }

  /**
   * Phase 11: 사용자 본인의 Gmail OAuth 앱 (UserCredential kind=tool, label=oauth-app)
   * 으로 access_token 발급. 실패 시 null 반환 + 사유 warn 로그.
   */
  private async tryIssueUserGmailAccessToken(userId: string) {
    const row = await this.prisma.userCredential.findFirst({
      where: { userId, kind: 'tool', targetId: 'gmail', label: 'oauth-app' },
    })
    if (!row) {
      this.logger.warn(`Gmail user token: row 없음 (userId=${userId})`)
      return null
    }
    let secrets: { clientSecret?: string; refreshToken?: string }
    try {
      const plain = decryptCredential(row.valueEnc)
      secrets = JSON.parse(plain)
    } catch (err) {
      this.logger.warn(
        `Gmail user token: valueEnc 복호화 실패 (userId=${userId}): ${err instanceof Error ? err.message : 'unknown'}`,
      )
      return null
    }
    if (!secrets.clientSecret || !secrets.refreshToken) {
      this.logger.warn(
        `Gmail user token: secrets 누락 (userId=${userId}, hasClientSecret=${!!secrets.clientSecret}, hasRefreshToken=${!!secrets.refreshToken})`,
      )
      return null
    }

    const meta = (row.metadata ?? {}) as { clientId?: string }
    if (!meta.clientId) {
      this.logger.warn(`Gmail user token: metadata.clientId 누락 (userId=${userId})`)
      return null
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: meta.clientId,
          client_secret: secrets.clientSecret,
          refresh_token: secrets.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      })
      if (!tokenRes.ok) {
        const bodyText = await tokenRes.text().catch(() => '<read failed>')
        this.logger.warn(
          `Gmail user token: Google 거절 (userId=${userId}, status=${tokenRes.status}, body=${bodyText.slice(0, 200)})`,
        )
        // 사용자가 OAuth 앱을 바꿔서 기존 refresh_token 이 invalid 가 된 경우가 흔함 — 상태를 invalid 로 표시
        if (tokenRes.status === 400 || tokenRes.status === 401) {
          await this.prisma.userCredential
            .update({ where: { id: row.id }, data: { status: 'invalid' } })
            .catch(() => undefined)
        }
        return null
      }
      const json = (await tokenRes.json()) as {
        access_token?: string
        expires_in?: number
        token_type?: string
      }
      if (!json.access_token) {
        this.logger.warn(`Gmail user token: 응답에 access_token 없음 (userId=${userId})`)
        return null
      }
      return {
        accessToken: json.access_token,
        expiresIn: json.expires_in,
        tokenType: json.token_type,
      }
    } catch (err) {
      this.logger.warn(
        `Gmail user token: 네트워크/예외 (userId=${userId}): ${err instanceof Error ? err.message : 'unknown'}`,
      )
      return null
    }
  }

  async toggleBuiltin(projectId: string, toolId: string, enabled: boolean) {
    if (!BUILTIN_TOOL_IDS.has(toolId)) {
      throw new NotFoundException(`Built-in tool '${toolId}' not found`)
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { enabledBuiltins: true, builtinConfigs: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    const gmailToolIds = ['gmail_search', 'gmail_fetch', 'gmail_fetch_attachment', 'gmail_parse_pdf_attachment', 'gmail_send']
    if (enabled && gmailToolIds.includes(toolId)) {
      const configs = (project.builtinConfigs as Record<string, any>) ?? {}
      const enc = (configs.gmail_connect?.refreshTokenEncrypted as string | undefined)
        || (configs.gmail_search?.refreshTokenEncrypted as string | undefined)
      if (!enc) throw new BadRequestException('Gmail이 아직 연동되지 않았습니다')
    }

    const current = new Set(project.enabledBuiltins)
    if (enabled) current.add(toolId)
    else current.delete(toolId)

    if (!enabled && toolId === 'gmail_connect') {
      gmailToolIds.forEach(id => current.delete(id))
    }

    let nextBuiltinConfigs = project.builtinConfigs as Prisma.InputJsonValue | undefined
    if (!enabled && toolId === 'gmail_connect') {
      const existing = (project.builtinConfigs as Record<string, any>) ?? {}
      if (existing.gmail_connect) {
        const { gmail_connect, ...rest } = existing
        nextBuiltinConfigs = rest as Prisma.InputJsonValue
      }
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        enabledBuiltins: Array.from(current),
        ...(nextBuiltinConfigs !== undefined ? { builtinConfigs: nextBuiltinConfigs } : {}),
      },
    })

    return { toolId, enabled }
  }

  // ============================================================
  // Tool Testing
  // ============================================================

  async testById(id: string, input: Record<string, unknown> = {}) {
    const tool = await this.getById(id)
    return this.executeTest(tool.type, tool.config as Record<string, unknown>, input)
  }

  async testInline(
    type: string,
    config: Record<string, unknown>,
    input: Record<string, unknown> = {},
  ) {
    return this.executeTest(type, config, input)
  }

  private async executeTest(
    type: string,
    config: Record<string, unknown>,
    input: Record<string, unknown>,
  ) {
    if (type === 'code') {
      return this.executeCodeTool(config as unknown as CodeToolConfig, input)
    }

    if (type !== 'http') {
      return { success: true, output: { message: `${type} tool 테스트는 저장 후 실행에서 지원됩니다.` }, latency: 0 }
    }

    const cfg = config as unknown as HttpToolConfig
    const start = Date.now()

    try {
      const url = this.interpolate(cfg.url ?? '', input, 'url')
      const method = (cfg.method ?? 'GET').toUpperCase()
      const headers: Record<string, string> = { ...(cfg.headers ?? {}) }

      if (cfg.auth) {
        if (cfg.auth.type === 'bearer' && cfg.auth.value) {
          headers['Authorization'] = `Bearer ${cfg.auth.value}`
        } else if (cfg.auth.type === 'api_key' && cfg.auth.value) {
          headers[cfg.auth.headerName ?? 'X-API-Key'] = cfg.auth.value
        } else if (cfg.auth.type === 'basic' && cfg.auth.value) {
          headers['Authorization'] = `Basic ${Buffer.from(cfg.auth.value).toString('base64')}`
        }
      }

      let body: string | undefined
      if (cfg.bodyTemplate && method !== 'GET') {
        body = this.interpolate(cfg.bodyTemplate, input, 'json')
        headers['Content-Type'] = 'application/json'
      }

      const res = await fetch(url, { method, headers, body })
      const latency = Date.now() - start

      let output: unknown
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        output = await res.json()
      } else {
        output = await res.text()
      }

      const headerFlags = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ')
      const bodyFlag = body ? `-d '${body.replace(/'/g, "'\\''")}'` : ''
      const curlCommand = `curl -X ${method} "${url}" ${headerFlags} ${bodyFlag}`.trim()

      return { success: res.ok, statusCode: res.status, output, latency, curlCommand }
    } catch (err) {
      return { success: false, output: null, latency: Date.now() - start, error: String(err) }
    }
  }

  private interpolate(template: string, vars: Record<string, unknown>, mode: 'url' | 'json' | 'none' = 'none'): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = vars[key];
      if (val === undefined) return `{{${key}}}`;
      
      if (mode === 'url') {
        return encodeURIComponent(String(val));
      }
      
      if (mode === 'json') {
        if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val);
        }
        if (typeof val === 'string') {
          const escaped = JSON.stringify(val);
          return escaped.substring(1, escaped.length - 1);
        }
      }
      
      return String(val);
    });
  }

  private async executeCodeTool(config: CodeToolConfig, input: Record<string, unknown>) {
    const start = Date.now()
    const language = config.language || 'javascript'
    
    try {
      if (language === 'javascript') {
        return await this.executeJavaScript(config.code, input, start)
      } else {
        return await this.executePython(config.code, input, start)
      }
    } catch (err) {
      return { 
        success: false, 
        output: null, 
        latency: Date.now() - start, 
        error: String(err) 
      }
    }
  }

  private async executeJavaScript(code: string, input: Record<string, unknown>, start: number) {
    try {
      const fn = new Function('input', code)
      const output = await fn(input)
      return { success: true, output, latency: Date.now() - start }
    } catch (err) {
      return { success: false, output: null, latency: Date.now() - start, error: String(err) }
    }
  }

  private async executePython(code: string, input: Record<string, unknown>, start: number) {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      
      const script = `
import sys
import json

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        
        # User context
        input = input_data
        
        # User code starts here
${code.split('\n').map(line => '        ' + line).join('\n')}
        # User code ends here
        
        if 'result' in locals():
            print(json.dumps(result))
        else:
            print(json.dumps(None))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
`
      const py = spawn('python3', ['-c', script])

      py.stdin.write(JSON.stringify(input))
      py.stdin.end()

      py.stdout.on('data', (data) => { stdout += data.toString() })
      py.stderr.on('data', (data) => { stderr += data.toString() })

      py.on('close', (code) => {
        const latency = Date.now() - start
        if (code === 0) {
          try {
            const output = JSON.parse(stdout.trim())
            resolve({ success: true, output, latency, logs: stderr })
          } catch (_err) {
            const lines = stdout.trim().split('\n')
            const lastLine = lines[lines.length - 1]
            try {
              const output = JSON.parse(lastLine)
              resolve({ success: true, output, latency, logs: stderr + (lines.length > 1 ? stdout : '') })
            } catch {
              resolve({ success: false, output: stdout, latency, error: 'JSON parsing error', logs: stderr })
            }
          }
        } else {
          resolve({ success: false, output: null, latency, error: stderr || 'Python execution failed', logs: stderr })
        }
      })
    })
  }
}
