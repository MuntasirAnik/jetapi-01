import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string; // e.g. 'user.role_changed', 'user.deactivated', 'banner.created'

  @Column({ nullable: true })
  targetType: string; // 'user', 'organization', 'plan', 'banner', 'system'

  @Column({ nullable: true })
  targetId: string;

  @Column({ nullable: true })
  targetLabel: string; // e.g. user email, org name

  @Column()
  performedBy: string; // admin user ID

  @Column({ nullable: true })
  performerName: string; // admin name/email for display

  @Column({ type: 'text', nullable: true })
  details: string | null; // JSON string with extra context

  @Column({ nullable: true })
  ipAddress: string; // IP address of the admin

  @CreateDateColumn()
  createdAt: Date;
}
