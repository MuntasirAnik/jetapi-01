import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Plan {
  @PrimaryColumn()
  id: string; // FREE, PRO, TEAM

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceMonthly: number; // in dollars

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceYearly: number; // in dollars (per year)

  @Column({ type: 'int', default: 3 })
  maxCollections: number;

  @Column({ type: 'int', default: 25 })
  maxRequestsPerCollection: number;

  @Column({ type: 'int', default: 2 })
  maxMembers: number;

  @Column({ type: 'int', default: 3 })
  maxCollaborators: number;

  @Column({ type: 'int', default: 2 })
  maxEnvironments: number;

  @Column({ type: 'int', default: 7 })
  historyDays: number;

  @Column({ type: 'int', default: 1 })
  maxUploadMb: number;

  @Column({ type: 'boolean', default: false })
  analyticsAccess: boolean;

  @Column({ type: 'boolean', default: false })
  sharedCollections: boolean;

  @Column({ type: 'boolean', default: false })
  apiDocExport: boolean;

  @Column({ type: 'text', default: '[]' })
  features: string; // JSON-stringified string[]

  @Column({ type: 'boolean', default: false })
  popular: boolean;

  @Column({ nullable: true })
  stripePriceIdMonthly: string;

  @Column({ nullable: true })
  stripePriceIdYearly: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
