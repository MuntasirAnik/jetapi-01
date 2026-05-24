import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { BannersController } from './banners.controller';
import { MaintenanceController, FeatureFlagsController, ChangelogController } from './maintenance.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { FeatureFlagGuard } from './feature-flag.guard';
import { PlanOverride } from './plan-override.entity';
import { Banner } from './banner.entity';
import { AuditLog } from './audit-log.entity';
import { SystemSetting } from './system-setting.entity';
import { Changelog } from './changelog.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Collection } from '../collections/collection.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Payment } from '../subscriptions/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanOverride,
      User,
      Organization,
      OrganizationUser,
      Collection,
      Subscription,
      Payment,
      Banner,
      AuditLog,
      SystemSetting,
      Changelog,
    ]),
    JwtModule.register({
      secret: 'YOUR_SECRET_KEY',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AdminController, BannersController, MaintenanceController, FeatureFlagsController, ChangelogController],
  providers: [AdminService, AdminGuard, FeatureFlagGuard],
  exports: [AdminService, FeatureFlagGuard, TypeOrmModule],
})
export class AdminModule {}
