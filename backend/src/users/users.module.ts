import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { Workspace } from '../workspaces/workspace.entity';
import { Collection } from '../collections/collection.entity';
import { RequestItem } from '../requests/request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Workspace, Collection, RequestItem])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
