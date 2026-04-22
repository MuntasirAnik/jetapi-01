import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { InitService } from './init.service';

@UseGuards(AuthGuard)
@Controller('api/init')
export class InitController {
  constructor(private readonly initService: InitService) {}

  @Get()
  getInitData(@Request() req: any) {
    return this.initService.getInitData(req.user.sub);
  }
}
