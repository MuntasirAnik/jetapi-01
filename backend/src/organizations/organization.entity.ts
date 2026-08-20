import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrganizationUser } from './organization-user.entity';

@Entity()
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  ownerId: string; // The original creator

  @Column({ default: 'FREE' })
  subscriptionTier: string; // e.g., 'FREE', 'PRO'

  @Column({ default: 3 })
  maxMembers: number;

  @OneToMany(() => OrganizationUser, (orgUser) => orgUser.organization, {
    cascade: true,
  })
  users: OrganizationUser[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
