import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InitController } from './init.controller';
import { InitService } from './init.service';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { Collection } from '../collections/collection.entity';
import { Environment } from '../environments/environment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationUser,
      Workspace,
      Collection,
      Environment,
    ]),
  ],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule {}
