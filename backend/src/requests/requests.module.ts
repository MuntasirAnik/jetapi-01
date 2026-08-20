import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestItem } from './request.entity';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([RequestItem]), ActivityModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
