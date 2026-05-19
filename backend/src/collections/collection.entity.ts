import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity';
import { RequestItem } from '../requests/request.entity';
import { User } from '../users/user.entity';
import { CollectionShare } from './collection-share.entity';

@Entity()
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.collections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column()
  workspaceId: string;

  @OneToMany(() => RequestItem, (requestItem) => requestItem.collection, { cascade: true })
  requests: RequestItem[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ nullable: true })
  ownerId: string;

  @OneToMany(() => CollectionShare, (share) => share.collection, { cascade: true })
  shares: CollectionShare[];

  // Virtual property for backward compatibility — populated in service layer
  sharedUsers?: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
