/*
  Warnings:

  - Added the required column `provider` to the `accounts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "provider" TEXT NOT NULL,
ALTER COLUMN "providerId" DROP NOT NULL;
