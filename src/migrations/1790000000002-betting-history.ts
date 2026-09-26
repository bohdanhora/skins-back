import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BettingHistory1790000000002 implements MigrationInterface {
  name = 'BettingHistory1790000000002';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "bet_map_results" (
        "key" varchar(300) PRIMARY KEY,
        "played_at" timestamptz NOT NULL,
        "tournament" varchar(200) NOT NULL,
        "team1" varchar(100) NOT NULL,
        "team2" varchar(100) NOT NULL,
        "map" varchar(40) NOT NULL,
        "score1" smallint NOT NULL,
        "score2" smallint NOT NULL,
        "winner" smallint NOT NULL,
        "best_of" smallint
      )
    `);
    await runner.query(
      `CREATE INDEX "bet_map_results_played_at" ON "bet_map_results" ("played_at")`,
    );
    await runner.query(`
      CREATE TABLE "bet_pages" (
        "path" varchar(300) PRIMARY KEY,
        "fetched_at" timestamptz NOT NULL,
        "matches" integer NOT NULL DEFAULT 0,
        "last_match_at" timestamptz
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "bet_pages"`);
    await runner.query(`DROP TABLE "bet_map_results"`);
  }
}
