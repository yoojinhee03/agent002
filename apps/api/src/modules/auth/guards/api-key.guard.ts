import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as crypto from 'crypto'
import { PrismaService } from '../../../prisma/prisma.service'
import { IS_API_KEY_AUTH } from '../decorators/api-key-auth.decorator'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isApiKeyAuth = this.reflector.getAllAndOverride<boolean>(IS_API_KEY_AUTH, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!isApiKeyAuth) return true

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
      apiKey?: unknown
      agentDeployment?: unknown
      agent?: unknown
    }>()
    const headerVal = req.headers['x-api-key'] ?? req.headers['X-API-Key']
    const rawKey = Array.isArray(headerVal) ? headerVal[0] : headerVal
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('API key required (X-API-Key header)')
    }

    const keyHash = crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex')
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        agentDeployment: {
          include: { agent: true, env: true },
        },
      },
    })
    if (!apiKey) throw new UnauthorizedException('Invalid API key')
    if (apiKey.status !== 'active' || !apiKey.enabled) {
      throw new UnauthorizedException('API key revoked or disabled')
    }

    const now = new Date()
    if (apiKey.validFrom && apiKey.validFrom > now) {
      throw new UnauthorizedException('API key not yet valid')
    }
    if (apiKey.expiresAt && apiKey.expiresAt < now) {
      throw new UnauthorizedException('API key expired')
    }

    if (!apiKey.agentDeployment) {
      throw new UnauthorizedException('API key not bound to an agent deployment')
    }
    if (apiKey.agentDeployment.status !== 'active') {
      throw new UnauthorizedException('Agent deployment is not active')
    }

    void this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
      .catch(() => {
        /* lastUsedAt 업데이트 실패는 인증을 막지 않는다 */
      })

    req.apiKey = apiKey
    req.agentDeployment = apiKey.agentDeployment
    req.agent = apiKey.agentDeployment.agent
    return true
  }
}
