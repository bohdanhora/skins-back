import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FavoriteSets1790000000005 implements MigrationInterface {
  name = 'FavoriteSets1790000000005';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "favorite_sets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await runner.query(`CREATE INDEX "favorite_sets_user_id" ON "favorite_sets" ("user_id")`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "favorite_sets"`);
  }
}
