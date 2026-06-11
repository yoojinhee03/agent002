import { SetMetadata } from '@nestjs/common'

export const IS_API_KEY_AUTH = 'isApiKeyAuth'

/**
 * 외부 API Key(X-API-Key) 인증을 사용하는 라우트에 부착.
 * JwtAuthGuard 를 우회하고 ApiKeyGuard 가 인증을 수행한다.
 */
export const ApiKeyAuth = () => SetMetadata(IS_API_KEY_AUTH, true)
