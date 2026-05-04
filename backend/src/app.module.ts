import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { CollectionsModule } from './collections/collections.module';
import { RequestsModule } from './requests/requests.module';
import { ProxyModule } from './proxy/proxy.module';
import { Workspace } from './workspaces/workspace.entity';
import { Collection } from './collections/collection.entity';
import { RequestItem } from './requests/request.entity';
import { EnvironmentsModule } from './environments/environments.module';
import { Environment } from './environments/environment.entity';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { Organization } from './organizations/organization.entity';
import { OrganizationUser } from './organizations/organization-user.entity';
import { Notification } from './notifications/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { InitModule } from './init/init.module';
import { ActivityModule } from './activity/activity.module';
import { Activity } from './activity/activity.entity';
import { CommentsModule } from './comments/comments.module';
import { Comment } from './comments/comment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isLocal = configService.get<string>('DB_HOST') === 'localhost' || configService.get<string>('DB_HOST') === '127.0.0.1';
        
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          ssl: isLocal ? false : true,
          extra: isLocal ? {} : {
            ssl: {
              rejectUnauthorized: false,
            },
          },
          entities: [Workspace, Collection, RequestItem, Environment, User, Organization, OrganizationUser, Notification, Activity, Comment],
          synchronize: true, // Use carefully in production
        };
      },
      inject: [ConfigService],
    }),
    WorkspacesModule,
    CollectionsModule,
    RequestsModule,
    ProxyModule,
    EnvironmentsModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    NotificationsModule,
    InitModule,
    ActivityModule,
    CommentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
