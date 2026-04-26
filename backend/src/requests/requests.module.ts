import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestItem } from './request.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([RequestItem]), SubscriptionsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
