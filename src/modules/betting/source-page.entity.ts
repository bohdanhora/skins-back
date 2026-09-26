import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('bet_pages')
export class SourcePageEntity {
  @PrimaryColumn({ type: 'varchar', length: 300 })
  path!: string;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;

  @Column({ type: 'integer', default: 0 })
  matches!: number;

  @Column({ name: 'last_match_at', type: 'timestamptz', nullable: true })
  lastMatchAt!: Date | null;
}
