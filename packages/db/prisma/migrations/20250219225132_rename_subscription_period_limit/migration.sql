/*
  Warnings:

  - You are about to drop the column `subscriptionPeriodLimit` on the `organizations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "subscriptionPeriodLimit",
ADD COLUMN     "subscriptionPeriodEventsLimit" INTEGER NOT NULL DEFAULT 0;
