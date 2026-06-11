import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateModelDto } from './dto/create-model.dto';
import {
  encryptCredential,
  decryptCredential,
  maskCredentialValue,
} from '../../common/credential-cipher';

const VALIDATION_TIMEOUT_MS = 8000;

// admin Providers 페이지의 API. 각 사용자가 본인 키를 등록·관리한다.
// 글로벌 Provider.apiKeyEncrypted 필드는 deprecated 이며 본 서비스에서는 사용하지 않는다.
// 사용자별 키는 UserCredential(kind=provider, targetId=<provider.slug>) 에 저장된다.
@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  private async getUserProviderCredentialBySlug(userId: string, slug: string) {
    return this.prisma.userCredential.findFirst({
      where: { userId, kind: 'provider', targetId: slug },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(userId: string) {
    const providers = await this.prisma.provider.findMany({ include: { models: true } });
    const creds = await this.prisma.userCredential.findMany({
      where: { userId, kind: 'provider' },
    });
    const credBySlug = new Map<string, (typeof creds)[number]>();
    for (const c of creds) credBySlug.set(c.targetId, c);

    return providers.map((p) => {
      const cred = credBySlug.get(p.slug) ?? null;
      let masked: string | null = null;
      if (cred?.valueEnc) {
        try {
          const plain = decryptCredential(cred.valueEnc);
          masked = maskCredentialValue(plain);
        } catch {
          masked = null;
        }
      }
      return {
        ...p,
        apiKeyConfigured: !!cred,
        apiKeyEncrypted: masked,
      };
    });
  }

  async configure(id: string, apiKey: string, userId: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    if (provider.type === 'cloud') {
      const validation = await this.validateProviderKey(provider.slug, apiKey);
      if (!validation.ok) {
        throw new BadRequestException(validation.message);
      }
    }

    const valueEnc = encryptCredential(apiKey);
    const existing = await this.getUserProviderCredentialBySlug(userId, provider.slug);
    if (existing) {
      await this.prisma.userCredential.update({
        where: { id: existing.id },
        data: { valueEnc, status: 'active', lastVerifiedAt: new Date() },
      });
    } else {
      await this.prisma.userCredential.create({
        data: {
          userId,
          kind: 'provider',
          targetId: provider.slug,
          label: '',
          valueEnc,
          status: 'active',
          lastVerifiedAt: new Date(),
        },
      });
    }

    const masked = maskCredentialValue(apiKey);
    const updated = await this.prisma.provider.findUnique({
      where: { id },
      include: { models: true },
    });
    return {
      ...updated,
      apiKeyConfigured: true,
      apiKeyEncrypted: masked,
      apiKey: masked,
    };
  }

  async removeApiKey(id: string, userId: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    await this.prisma.userCredential.deleteMany({
      where: { userId, kind: 'provider', targetId: provider.slug },
    });
    return { success: true };
  }

  async testConnection(id: string, userId: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    if (provider.type === 'local') {
      if (!provider.endpoint) {
        return { success: false, message: 'Endpoint not configured' };
      }
      const result = await this.validateLocalEndpoint(provider.endpoint);
      return { success: result.ok, message: result.message };
    }

    if (provider.type === 'cloud') {
      const cred = await this.getUserProviderCredentialBySlug(userId, provider.slug);
      if (!cred) {
        return { success: false, message: 'API key not configured' };
      }
      let apiKey: string;
      try {
        apiKey = decryptCredential(cred.valueEnc);
      } catch {
        return { success: false, message: '저장된 자격증명을 해독할 수 없습니다' };
      }
      const result = await this.validateProviderKey(provider.slug, apiKey);
      if (result.ok) {
        await this.prisma.userCredential.update({
          where: { id: cred.id },
          data: { status: 'active', lastVerifiedAt: new Date() },
        });
      } else {
        await this.prisma.userCredential.update({
          where: { id: cred.id },
          data: { status: 'invalid' },
        });
      }
      return { success: result.ok, message: result.message };
    }

    return { success: false, message: 'Unsupported provider type' };
  }

  private async validateProviderKey(
    slug: string,
    apiKey: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!apiKey || apiKey.trim().length < 8) {
      return { ok: false, message: '키 형식이 올바르지 않습니다 (최소 8자)' };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VALIDATION_TIMEOUT_MS);

    try {
      let res: Response;
      let providerLabel: string;

      switch (slug) {
        case 'openai':
          providerLabel = 'OpenAI';
          res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          break;
        case 'anthropic':
          providerLabel = 'Anthropic';
          res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            signal: ctrl.signal,
          });
          break;
        case 'google':
          providerLabel = 'Google';
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
            { signal: ctrl.signal },
          );
          break;
        default:
          return {
            ok: true,
            message: `${slug} 프로바이더는 키 자동 검증을 지원하지 않습니다 (형식만 검사)`,
          };
      }

      if (res.ok) {
        return { ok: true, message: `${providerLabel} 키 검증 성공` };
      }

      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) detail = body.error.message;
      } catch {
        try {
          const text = await res.text();
          if (text) detail = text.slice(0, 200);
        } catch {
          // ignore — fall back to HTTP status
        }
      }
      return { ok: false, message: `${providerLabel} 인증 실패: ${detail}` };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, message: `검증 요청 타임아웃 (${VALIDATION_TIMEOUT_MS / 1000}s)` };
      }
      return {
        ok: false,
        message: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async validateLocalEndpoint(
    endpoint: string,
  ): Promise<{ ok: boolean; message: string }> {
    const base = endpoint.trim().replace(/\/+$/, '');
    if (!base) return { ok: false, message: '엔드포인트가 비어있습니다' };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VALIDATION_TIMEOUT_MS);

    try {
      const tryUrl = async (url: string) => {
        try {
          const r = await fetch(url, { signal: ctrl.signal });
          return r.ok ? r : null;
        } catch {
          return null;
        }
      };

      const openaiCompat = await tryUrl(`${base}/v1/models`);
      if (openaiCompat) return { ok: true, message: '엔드포인트 응답 OK (/v1/models)' };

      const ollama = await tryUrl(`${base}/api/tags`);
      if (ollama) return { ok: true, message: '엔드포인트 응답 OK (Ollama /api/tags)' };

      return {
        ok: false,
        message: '엔드포인트 응답 없음 (/v1/models, /api/tags 모두 실패)',
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, message: `연결 타임아웃 (${VALIDATION_TIMEOUT_MS / 1000}s)` };
      }
      return {
        ok: false,
        message: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async toggleModel(providerId: string, modelId: string, enabled: boolean) {
    await this.prisma.model.update({
      where: { id: modelId },
      data: { enabled },
    });
    return { success: true };
  }

  // 사용자별 enabled model — 본인이 등록한 Provider 자격증명이 있는 Provider 의 enabled 모델만.
  async getEnabledModels(userId: string) {
    const creds = await this.prisma.userCredential.findMany({
      where: { userId, kind: 'provider', status: 'active' },
      select: { targetId: true },
    });
    const ownedSlugs = creds.map((c) => c.targetId);
    if (ownedSlugs.length === 0) return [];
    return this.prisma.model.findMany({
      where: {
        enabled: true,
        provider: { slug: { in: ownedSlugs } },
      },
      include: {
        provider: { select: { name: true, slug: true } },
      },
    });
  }

  async addCustomModel(providerId: string, data: CreateModelDto) {
    const { id, ...rest } = data;
    return this.prisma.model.create({
      data: {
        ...rest,
        modelId: id,
        providerId,
        isCustom: true,
      },
    });
  }

  async deleteCustomModel(providerId: string, modelId: string) {
    const model = await this.prisma.model.findUnique({ where: { id: modelId } });
    if (!model) throw new NotFoundException('Model not found');
    if (!model.isCustom) throw new BadRequestException('Only custom models can be deleted');

    await this.prisma.model.delete({ where: { id: modelId } });
    return { success: true };
  }

  async addLocalProvider(name: string, endpoint: string) {
    return this.prisma.provider.create({
      data: {
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        type: 'local',
        endpoint,
        apiKeyConfigured: !!endpoint.trim(),
      },
    });
  }

  async deleteLocalProvider(id: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.type !== 'local') throw new BadRequestException('Only local providers can be deleted');

    await this.prisma.provider.delete({ where: { id } });
    return { success: true };
  }

  async configureEndpoint(id: string, endpoint: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    await this.prisma.provider.update({
      where: { id },
      data: {
        endpoint,
        apiKeyConfigured: provider.type === 'local' ? !!endpoint.trim() : provider.apiKeyConfigured,
      },
    });
    return { success: true };
  }

  async discoverModels(id: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    return [];
  }
}
