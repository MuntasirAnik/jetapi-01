import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class FeedbackTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'feedback' })
  type: string; // 'bug' | 'feature' | 'feedback' | 'other'

  @Column({ default: 'medium' })
  priority: string; // 'low' | 'medium' | 'high' | 'critical'

  @Column({ default: 'open' })
  status: string; // 'open' | 'in_progress' | 'resolved' | 'closed'

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  userEmail: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  assignedTo: string; // admin user ID

  @Column({ nullable: true })
  assignedName: string;

  @Column({ type: 'text', nullable: true })
  adminNotes: string;

  @Column({ type: 'text', nullable: true })
  adminReply: string;

  @Column({ type: 'timestamp', nullable: true })
  repliedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  tags: string; // comma-separated tags

  @Column({ type: 'bytea', nullable: true })
  screenshotData: Buffer;

  @Column({ nullable: true })
  screenshotMime: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
