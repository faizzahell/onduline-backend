import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: string;
  database: 'connected';
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe including database connectivity' })
  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unreachable');
    }

    return {
      status: 'ok',
      service: 'ofda-backend',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
