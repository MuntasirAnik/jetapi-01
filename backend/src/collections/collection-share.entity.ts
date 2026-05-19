import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { Collection } from './collection.entity';
import { User } from '../users/user.entity';

@Entity('collection_shared_users')
export class CollectionShare {
  @PrimaryColumn()
  collectionId: string;

  @PrimaryColumn()
  userId: string;

  @Column({ default: 'viewer' })
  role: 'viewer' | 'editor' | 'admin';

  @ManyToOne(() => Collection, (collection) => collection.shares, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
