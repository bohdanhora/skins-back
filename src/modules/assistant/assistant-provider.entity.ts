import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { UserEntity } from '../auth/user.entity';

@Entity('assistant_providers')
export class AssistantProviderEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  @Column({ type: 'varchar', length: 120 })
  model!: string;

  @Column({ name: 'key_cipher', type: 'text' })
  keyCipher!: string;

  @Column({ name: 'key_iv', type: 'varchar', length: 40 })
  keyIv!: string;

  @Column({ name: 'key_tag', type: 'varchar', length: 40 })
  keyTag!: string;

  @Column({ name: 'key_hint', type: 'varchar', length: 40 })
  keyHint!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
