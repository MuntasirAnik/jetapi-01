import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Collection } from '../collections/collection.entity';
import { Organization } from '../organizations/organization.entity';
import { WorkspaceUser } from './workspace-user.entity';

@Entity()
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'TEAM' })
  visibility: string; // 'PERSONAL', 'TEAM', 'PARTNER', 'PUBLIC'

  @OneToMany(() => Collection, (collection) => collection.workspace, { cascade: true })
  collections: Collection[];

  @OneToMany(() => WorkspaceUser, (wsUser) => wsUser.workspace, { cascade: true })
  members: WorkspaceUser[];

  @Column()
  organizationId: string;

  @Column('simple-json', { default: '[]' })
  globalVariables: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
