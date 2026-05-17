import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [HttpModule, AdminModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
