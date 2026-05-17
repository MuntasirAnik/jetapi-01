import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userEmail: string;

  @Column({ nullable: true })
  userName: string;

  @Column()
  plan: string; // PRO, TEAM

  @Column()
  amount: string; // e.g. "$12"

  @Column()
  method: string; // card, mfs

  @Column({ nullable: true })
  cardLast4: string;

  @Column({ nullable: true })
  mfsProvider: string; // bkash, nagad, rocket

  @Column({ nullable: true })
  mfsNumber: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ default: 'completed' })
  status: string; // completed, refunded

  @Column()
  billingInterval: string; // monthly, yearly

  @CreateDateColumn()
  createdAt: Date;
}
