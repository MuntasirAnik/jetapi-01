import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity()
export class PlanOverride {
  @PrimaryColumn()
  planId: string; // FREE, PRO, TEAM

  @Column({ type: 'int', nullable: true })
  maxCollections: number | null;

  @Column({ type: 'int', nullable: true })
  maxRequestsPerCollection: number | null;

  @Column({ type: 'int', nullable: true })
  maxMembers: number | null;

  @Column({ type: 'int', nullable: true })
  maxEnvironments: number | null;

  @Column({ type: 'int', nullable: true })
  historyDays: number | null;

  @Column({ type: 'int', nullable: true })
  maxUploadMb: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
