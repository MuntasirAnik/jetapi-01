import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { LimitsService } from './limits.service';
import { Subscription } from './subscription.entity';
import { User } from '../users/user.entity';
import { Collection } from '../collections/collection.entity';
import { RequestItem } from '../requests/request.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Environment } from '../environments/environment.entity';
import { PlanOverride } from '../admin/plan-override.entity';
import { Payment } from './payment.entity';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      User,
      Collection,
      RequestItem,
      OrganizationUser,
      Environment,
      PlanOverride,
      Payment,
    ]),
    JwtModule.register({
      secret: 'YOUR_SECRET_KEY',
      signOptions: { expiresIn: '7d' },
    }),
    AdminModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, LimitsService],
  exports: [SubscriptionsService, LimitsService],
})
export class SubscriptionsModule {}
