import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Collection } from '../collections/collection.entity';

@Entity('request_item')
export class RequestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: 'GET' })
  method: string;

  @Column()
  url: string;

  @Column('json', { nullable: true })
  headers: any;

  @Column('json', { nullable: true })
  params: any;

  @Column('json', { nullable: true })
  pathVariables: any;

  @Column('json', { nullable: true })
  auth: any;

  @Column('text', { nullable: true })
  body: string;

  @Column('text', { nullable: true })
  preRequestScript: string;

  @Column('text', { nullable: true })
  testScript: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  folder: string;

  @ManyToOne(() => Collection, (collection) => collection.requests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;

  @Column()
  collectionId: string;

  @Column({ nullable: true })
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
