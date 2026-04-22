import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Collection } from '../collections/collection.entity';
import { Organization } from '../organizations/organization.entity';

@Entity()
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Collection, (collection) => collection.workspace, { cascade: true })
  collections: Collection[];

  @Column()
  organizationId: string;

  @Column('simple-json', { default: '[]' })
  globalVariables: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
