import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity()
@Unique(['userId', 'collectionId', 'pluginSlug'])
export class UserPlugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  collectionId: string;

  @Column()
  pluginSlug: string; // References Plugin.slug

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'text', default: '{}' })
  config: string; // User's per-collection config (JSON)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
