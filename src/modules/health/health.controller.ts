import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../access/public.decorator';

export class HealthDto {
  status!: 'ok';
  uptimeSeconds!: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness' })
  @ApiOkResponse({ type: HealthDto })
  check(): HealthDto {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
