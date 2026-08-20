import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiHit } from './api-hit.entity';
import { performance } from 'perf_hooks';
import { Request, Response } from 'express';

@Injectable()
export class ApiHitInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(ApiHit)
    private readonly apiHitRepo: Repository<ApiHit>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    // Only log the collection-based API proxy execution endpoint
    const url = request.url || '';
    if (url !== '/proxy/execute') {
      return next.handle();
    }

    const start = performance.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Math.round(performance.now() - start);
        const statusCode = response.statusCode || 200;
        this.logHit(request, statusCode, duration);
      }),
      catchError((error: any) => {
        const duration = Math.round(performance.now() - start);
        const statusCode = (error.status as number) || (error.statusCode as number) || 500;
        this.logHit(request, statusCode, duration);
        return throwError(() => error);
      }),
    );
  }

  private logHit(request: Request, statusCode: number, durationMs: number) {
    // Perform database operations asynchronously without blocking request resolution
    try {
      const reqAny = request as any;
      const user = reqAny.user;
      const userId = (user?.sub as string) || null;
      const userEmail = (user?.email as string) || null;
      const ipAddress =
        request.ip ||
        (request.headers['x-forwarded-for'] as string) ||
        request.socket?.remoteAddress ||
        null;

      // If it is proxy execute, we can extract the target/destination URL
      let destinationUrl: string | null = null;
      if (request.url === '/proxy/execute' && reqAny.body) {
        destinationUrl = (reqAny.body.url as string) || null;
      }

      const hit = this.apiHitRepo.create({
        userId,
        userEmail,
        endpoint: request.url,
        destinationUrl,
        method: request.method,
        statusCode,
        durationMs,
        ipAddress,
      });

      this.apiHitRepo.save(hit).catch((e) => {
        console.error('Async API Hit save failed:', e);
      });
    } catch (e) {
      console.error('Failed to initiate API Hit logging:', e);
    }
  }
}
