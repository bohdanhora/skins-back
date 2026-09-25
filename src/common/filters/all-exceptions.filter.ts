import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Something went wrong';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        error = exception.name;
        message = payload;
      } else {
        const record = payload as { message?: string | string[]; error?: string };

        error = record.error ?? exception.name;
        message = record.message ?? exception.message;
      }
    }

    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
