import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { json, urlencoded } from 'express'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableShutdownHooks()
  const configService = app.get(ConfigService)

  app.use(
    json({
      limit: '25mb',
      verify: (req, _res, buf) => {
        // NAVER WORKS callback HMAC 검증을 위해 raw body 보존
        ;(req as unknown as { rawBody?: Buffer }).rawBody = Buffer.isBuffer(buf)
          ? Buffer.from(buf)
          : Buffer.from(buf as ArrayBufferLike)
      },
    }),
  )
  app.use(urlencoded({ limit: '25mb', extended: true }))

  const allowedOrigins = configService.get<string>('CORS_ORIGINS')?.split(',').map((s) => s.trim()) || ['http://localhost:3001']

  app.setGlobalPrefix('api')
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.useGlobalFilters(new HttpExceptionFilter())

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('AgentStudio API')
    .setDescription(
      'AgentStudio 관리 API. Client UI(`apps/agent-web`) 페이지별 사용 매핑은 `API.md` §10 참조.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'POST /api/auth/login 으로 발급받은 accessToken',
      },
      'bearer',
    )
    .addServer('http://localhost:4200', 'local dev')
    .addTag('Auth', '로그인/토큰 갱신')
    .addTag('Users', '사용자')
    .addTag('Projects', '프로젝트')
    .addTag('ClientAgents', 'Client UI: 배포된 에이전트 디스커버리')
    .addTag('Threads', 'Client UI: 채팅 thread CRUD + invoke/resume/messages')
    .addTag('MeCredentials', 'Client UI: 사용자 자격증명 (provider/tool/mcp)')
    .addTag('MeCredentials.Gmail', 'Client UI: Gmail OAuth 앱 + refresh_token')
    .addTag('MeProviders', 'Client UI: Provider 카탈로그 + 등록')
    .addTag('MeTools', 'Client UI: 도구 자격증명 카탈로그')
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
    },
    customSiteTitle: 'AgentStudio API Docs',
  })

  const port = configService.get<number>('PORT') || 4200
  await app.listen(port)
  console.log(`API server running on http://localhost:${port}`)
  console.log(`Swagger docs at http://localhost:${port}/api/docs`)
}

bootstrap()
