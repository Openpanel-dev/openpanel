/*
  Warnings:

  - Added the required column `name` to the `notification_rules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "notification_rules" ADD COLUMN     "name" TEXT NOT NULL;
