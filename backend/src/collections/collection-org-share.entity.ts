import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { Collection } from './collection.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('collection_shared_organizations')
export class CollectionOrgShare {
  @PrimaryColumn()
  collectionId: string;

  @PrimaryColumn()
  organizationId: string;

  @Column({ default: 'viewer' })
  role: 'viewer' | 'editor' | 'admin';

  @ManyToOne(() => Collection, (collection) => collection.orgShares, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
