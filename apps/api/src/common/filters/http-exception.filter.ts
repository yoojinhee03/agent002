import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Request, Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message: string | string[] = 'Internal server error'
    let error = 'Internal Server Error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse() as any
      message = res.message || res
      error = res.error || HttpStatus[status]
    } else if (exception.code && exception.meta) {
      // Handle Prisma errors
      status = HttpStatus.BAD_REQUEST
      message = `Database error: ${exception.code}`
      error = 'Bad Request'
      this.logger.error(`Prisma error ${exception.code}: ${JSON.stringify(exception.meta)}`)
    } else {
      // Log unexpected errors
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack)
      message = exception.message || message
    }

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message, // Simplify for common toast notifications
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      // Include original message if it's a validation error array
      details: Array.isArray(message) ? message : undefined,
    })
  }
}
