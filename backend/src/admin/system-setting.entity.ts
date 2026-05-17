import { Entity, Column, UpdateDateColumn, PrimaryColumn } from 'typeorm';

@Entity()
export class SystemSetting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text', default: '' })
  value: string; // JSON string

  @UpdateDateColumn()
  updatedAt: Date;
}
