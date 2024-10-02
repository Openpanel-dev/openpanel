/*
  Warnings:

  - You are about to drop the column `type` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `notification_settings` table. All the data in the column will be lost.
  - Added the required column `config` to the `notification_settings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "integrations" DROP COLUMN "type";

-- AlterTable
ALTER TABLE "notification_settings" DROP COLUMN "settings",
ADD COLUMN     "config" JSONB NOT NULL;
