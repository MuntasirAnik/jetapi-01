import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ProxyService, ProxyRequestDto } from './proxy.service';
import { FeatureFlagGuard, RequireFeature } from '../admin/feature-flag.guard';

@Controller('proxy')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('execute')
  @UseGuards(FeatureFlagGuard)
  @RequireFeature('allow_api_execution')
  execute(@Body() requestDto: ProxyRequestDto) {
    return this.proxyService.executeRequest(requestDto);
  }
}
