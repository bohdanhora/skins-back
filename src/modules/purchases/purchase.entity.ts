import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../auth/user.entity';

@Entity('purchases')
export class PurchaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image!: string | null;

  @Column({ name: 'rarity_color', type: 'varchar', length: 16, nullable: true })
  rarityColor!: string | null;

  @Column({ type: 'integer' })
  price!: number;

  @Column({ type: 'integer', default: 1 })
  amount!: number;

  @Column({ type: 'varchar', length: 16 })
  market!: string;

  @Column({ name: 'bought_at', type: 'timestamptz' })
  boughtAt!: Date;

  @Column({ name: 'unlock_at', type: 'timestamptz' })
  unlockAt!: Date;

  @Column({ type: 'double precision', nullable: true })
  float!: number | null;

  @Column({ name: 'paint_seed', type: 'integer', nullable: true })
  paintSeed!: number | null;

  @Column({ type: 'text', default: '' })
  note!: string;

  @Column({ name: 'asset_id', type: 'varchar', length: 32, nullable: true })
  assetId!: string | null;

  @Column({ name: 'sold_market', type: 'varchar', length: 16, nullable: true })
  soldMarket!: string | null;

  @Column({ name: 'sold_received', type: 'integer', nullable: true })
  soldReceived!: number | null;

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
