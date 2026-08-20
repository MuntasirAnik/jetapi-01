import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from '../users/user.entity';

@Entity()
@Unique(['workspaceId', 'userId'])
export class WorkspaceUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 'EDITOR' })
  role: string; // 'ADMIN', 'EDITOR', 'VIEWER'

  @CreateDateColumn()
  addedAt: Date;
}
