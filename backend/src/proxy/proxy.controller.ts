import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ProxyService, ProxyRequestDto } from './proxy.service';
import { FeatureFlagGuard, RequireFeature } from '../admin/feature-flag.guard';
import { RateLimitGuard } from '../admin/rate-limit.guard';
import { AuthGuard } from '../auth/auth.guard';

@Controller(['proxy', 'api/proxy'])
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('execute')
  @UseGuards(AuthGuard, FeatureFlagGuard, RateLimitGuard)
  @RequireFeature('allow_api_execution')
  execute(@Body() requestDto: ProxyRequestDto) {
    return this.proxyService.executeRequest(requestDto);
  }
}
