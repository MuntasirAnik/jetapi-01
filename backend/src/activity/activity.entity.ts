import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Collection } from '../collections/collection.entity';
import { User } from '../users/user.entity';

@Entity()
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column()
  userEmail: string;

  @Column()
  action: string; // CREATED, UPDATED, DELETED, SHARED, UNSHARED, RESTORED, COMMENTED

  @Column()
  entityType: string; // REQUEST, COLLECTION, COMMENT

  @Column({ nullable: true })
  entityId: string;

  @Column({ nullable: true })
  entityName: string;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;

  @Column({ nullable: true })
  collectionId: string;

  @Column('json', { nullable: true })
  metadata: any; // e.g. { changes: { field: 'method', from: 'GET', to: 'POST' } }

  @CreateDateColumn()
  createdAt: Date;
}
