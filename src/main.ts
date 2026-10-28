import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './config/env.validation.js';
import { suppressPgQueryDeprecation } from './config/suppress-pg-deprecation.js';

async function bootstrap(): Promise<void> {
  // Filters out a benign deprecation warning emitted by @prisma/adapter-pg
  // inside interactive transactions. See the helper for the full explanation.
  suppressPgQueryDeprecation();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // CORS is restricted to the declared origins rather than opened to everyone.
  app.enableCors({
    origin: parseCorsOrigins(configService.getOrThrow<string>('CORS_ORIGINS')),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Makes sure onModuleDestroy runs so the Prisma and Redis connections are
  // closed cleanly when the process is stopped.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OFDA Portal API')
    .setDescription(
      'Backend API for purchase invoice OCR and Business Central integration.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Users')
    .addTag('Invoices')
    .addTag('Health')
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port);

  new Logger('Bootstrap').log(
    `Server running at http://localhost:${port}/api, documentation at /api/docs`,
  );
}

void bootstrap();
