import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseStickers1790000000003 implements MigrationInterface {
  name = 'PurchaseStickers1790000000003';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "purchases" ADD COLUMN "stickers" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "purchases" DROP COLUMN "stickers"`);
  }
}
