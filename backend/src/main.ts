import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as compressionModule from 'compression';
const compress = (compressionModule as any).default || compressionModule;
import * as dns from 'dns';

// Fixes ~5s DNS resolution lag for 'localhost' requests in Node 17+ by preferring IPv4
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, Postman, same-origin)
      if (!origin) return callback(null, true);
      const allowed = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      // Also allow any LAN IP on port 3000 for dev
      if (allowed.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):3000$/.test(origin)) {
        return callback(null, true);
      }
      callback(null, true); // Allow all in dev; tighten in production
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(compress()); // gzip all responses — reduces JSON payloads by 70-90%
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
