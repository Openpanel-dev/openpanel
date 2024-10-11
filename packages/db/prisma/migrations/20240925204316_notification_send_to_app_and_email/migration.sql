/*
  Warnings:

  - You are about to drop the column `integrationType` on the `notifications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "notification_settings" ADD COLUMN     "sendToApp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendToEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "integrationType",
ADD COLUMN     "sendToApp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendToEmail" BOOLEAN NOT NULL DEFAULT false;
