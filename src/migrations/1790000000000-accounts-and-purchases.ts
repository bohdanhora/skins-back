import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountsAndPurchases1790000000000 implements MigrationInterface {
  name = 'AccountsAndPurchases1790000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "steam_id" varchar(17) NOT NULL UNIQUE,
        "name" varchar(128),
        "avatar" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE "sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_hash" char(64) NOT NULL UNIQUE,
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL
      )
    `);
    await runner.query(`CREATE INDEX "sessions_user_id" ON "sessions" ("user_id")`);
    await runner.query(`
      CREATE TABLE "purchases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "name" varchar(256) NOT NULL,
        "image" varchar(512),
        "rarity_color" varchar(16),
        "price" integer NOT NULL,
        "amount" integer NOT NULL DEFAULT 1,
        "market" varchar(16) NOT NULL,
        "bought_at" timestamptz NOT NULL,
        "unlock_at" timestamptz NOT NULL,
        "float" double precision,
        "paint_seed" integer,
        "note" text NOT NULL DEFAULT '',
        "asset_id" varchar(32),
        "sold_market" varchar(16),
        "sold_received" integer,
        "sold_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await runner.query(
      `CREATE INDEX "purchases_user_id_bought_at" ON "purchases" ("user_id", "bought_at")`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "purchases"`);
    await runner.query(`DROP TABLE "sessions"`);
    await runner.query(`DROP TABLE "users"`);
  }
}
