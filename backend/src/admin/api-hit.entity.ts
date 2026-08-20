import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class ApiHit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', nullable: true })
  userEmail: string | null;

  @Index()
  @Column()
  endpoint: string;

  @Column({ type: 'varchar', nullable: true })
  destinationUrl: string | null;

  @Column()
  method: string;

  @Column()
  statusCode: number;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
