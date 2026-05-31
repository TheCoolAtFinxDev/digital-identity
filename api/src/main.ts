import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  // 64 KB body limit — CSRs are never more than a few KB
  app.use(json({ limit: '64kb' }));

  // Global validation: strip unknown properties, reject bad input at the boundary
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('Digital Identity Certificate Service')
    .setDescription('Entity Identity Certificate Service — issues and manages PKI certificates for verified legal entities and digital objects.')
    .setVersion('0.1.0')
    .addTag('auth', 'Authentication')
    .addTag('health', 'Service health')
    .addTag('certificates', 'Certificate request lifecycle')
    .addTag('entities', 'Legal entity registration and KYC')
    .addTag('objects', 'Digital object identity records')
    .addTag('verification', 'Public certificate verification (no auth required)')
    .addTag('audit', 'Audit log query (operator use)')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 8080;
  await app.listen(port);

  console.log(`digital identity certsvc listening on :${port}`);
  console.log(`swagger UI: http://localhost:${port}/api-docs`);
}

bootstrap();
