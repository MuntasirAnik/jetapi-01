import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from './organization.entity';

@Entity()
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ default: 'MEMBER' })
  role: string; // role to assign on accept

  @Column({ default: 'PENDING' })
  status: string; // 'PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'

  @Column()
  invitedBy: string; // userId who sent the invite

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
