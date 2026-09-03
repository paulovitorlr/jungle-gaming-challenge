import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
    };
  }

  @Get('health/live')
  live() {
    return { status: 'ok' };
  }
}
