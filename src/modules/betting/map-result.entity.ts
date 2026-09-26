import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('bet_map_results')
export class MapResultEntity {
  @PrimaryColumn({ type: 'varchar', length: 300 })
  key!: string;

  @Column({ name: 'played_at', type: 'timestamptz' })
  playedAt!: Date;

  @Column({ type: 'varchar', length: 200 })
  tournament!: string;

  @Column({ type: 'varchar', length: 100 })
  team1!: string;

  @Column({ type: 'varchar', length: 100 })
  team2!: string;

  @Column({ type: 'varchar', length: 40 })
  map!: string;

  @Column({ type: 'smallint' })
  score1!: number;

  @Column({ type: 'smallint' })
  score2!: number;

  @Column({ type: 'smallint' })
  winner!: 1 | 2;

  @Column({ name: 'best_of', type: 'smallint', nullable: true })
  bestOf!: number | null;
}
