import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'steam_id', type: 'varchar', length: 17, unique: true })
  steamId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatar!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz' })
  lastLoginAt!: Date;
}
