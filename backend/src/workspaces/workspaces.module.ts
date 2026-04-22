import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from './workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, OrganizationUser])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
