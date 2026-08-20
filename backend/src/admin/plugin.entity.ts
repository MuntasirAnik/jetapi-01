import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ default: 'other' })
  category: string; // notification, ci-cd, monitoring, automation, storage, other

  @Column({ default: '' })
  icon: string; // Lucide icon name

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'text', default: '{}' })
  config: string; // JSON — stored credentials/settings

  @Column({ type: 'text', default: '[]' })
  configSchema: string; // JSON — field definitions for the config form

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
