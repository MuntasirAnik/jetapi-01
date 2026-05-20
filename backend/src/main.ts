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
  app.enableCors();
  app.use(compress()); // gzip all responses — reduces JSON payloads by 70-90%
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
