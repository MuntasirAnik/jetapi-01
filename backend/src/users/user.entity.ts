import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'bytea', nullable: true, select: false })
  avatarData: Buffer;

  @Column({ nullable: true })
  avatarMimeType: string;

  @Column({ nullable: true })
  resetToken: string;

  @Column({ nullable: true })
  resetTokenExpiry: Date;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ default: 'USER' })
  role: string; // 'USER' | 'SUPER_ADMIN'

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockedUntil: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @Column({ nullable: true })
  company: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
