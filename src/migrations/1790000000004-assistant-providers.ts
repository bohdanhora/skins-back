import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AssistantProviders1790000000004 implements MigrationInterface {
  name = 'AssistantProviders1790000000004';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "assistant_providers" (
        "user_id" uuid PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
        "provider" varchar(20) NOT NULL,
        "model" varchar(120) NOT NULL,
        "key_cipher" text NOT NULL,
        "key_iv" varchar(40) NOT NULL,
        "key_tag" varchar(40) NOT NULL,
        "key_hint" varchar(40) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "assistant_providers"`);
  }
}
