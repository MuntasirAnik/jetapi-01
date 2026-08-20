import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { CollectionPluginsController } from './collection-plugins.controller';
import { Collection } from './collection.entity';
import { CollectionShare } from './collection-share.entity';
import { UserPlugin } from './user-plugin.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Collection,
      CollectionShare,
      Workspace,
      OrganizationUser,
      UserPlugin,
    ]),
    UsersModule,
    NotificationsModule,
    SubscriptionsModule,
    AdminModule,
  ],
  controllers: [CollectionsController, CollectionPluginsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
