import { Controller, Post, Body } from '@nestjs/common';
import { ProxyService, ProxyRequestDto } from './proxy.service';

@Controller('proxy')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('execute')
  execute(@Body() requestDto: ProxyRequestDto) {
    return this.proxyService.executeRequest(requestDto);
  }
}
