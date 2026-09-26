import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { UserEntity } from '../auth/user.entity';

export interface MarketFees {
  whiteMarket: number;
  dmarket: number;
  csfloat: number;
}

@Entity('user_settings')
export class UserSettingsEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'jsonb', nullable: true })
  fees!: MarketFees | null;

  @Column({ type: 'jsonb', nullable: true })
  withdrawals!: MarketFees | null;

  @Column({ name: 'steam_profile', type: 'varchar', length: 200, nullable: true })
  steamProfile!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  theme!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
