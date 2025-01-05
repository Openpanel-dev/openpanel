/*
  Warnings:

  - You are about to drop the column `eventsCount` on the `organizations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "eventsCount",
ADD COLUMN     "subscriptionPeriodEventsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionStartsAt" TIMESTAMP(3);
