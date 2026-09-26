import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FavoritesAndSettings1790000000001 implements MigrationInterface {
  name = 'FavoritesAndSettings1790000000001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "favorites" (
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "name" varchar(256) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "name")
      )
    `);
    await runner.query(`
      CREATE TABLE "user_settings" (
        "user_id" uuid PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
        "fees" jsonb,
        "withdrawals" jsonb,
        "steam_profile" varchar(200),
        "theme" varchar(16),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "user_settings"`);
    await runner.query(`DROP TABLE "favorites"`);
  }
}
