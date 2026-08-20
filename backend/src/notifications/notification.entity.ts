import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  message: string;

  @Column({ default: 'GENERAL' })
  type: string; // 'GENERAL', 'TEAM_INVITE', 'TEAM_INVITE_ACCEPTED', 'TEAM_INVITE_DECLINED'

  @Column({ type: 'simple-json', nullable: true, default: null })
  metadata: any; // e.g. { invitationId: '...', organizationName: '...' }

  @Column({ default: false })
  isRead: boolean;

  @Column()
  userId: string;

  @ManyToOne(() => User, undefined, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
