import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './activity.entity';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { Collection } from '../collections/collection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Activity, Collection])],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
