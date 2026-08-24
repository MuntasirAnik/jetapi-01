import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Organization } from '../organizations/organization.entity';
import { SystemSetting } from '../admin/system-setting.entity';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      Workspace,
      OrganizationUser,
      Organization,
      SystemSetting,
    ]),
  ],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
