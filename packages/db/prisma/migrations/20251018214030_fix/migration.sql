/*
  Warnings:

  - You are about to drop the column `provider` on the `imports` table. All the data in the column will be lost.
  - You are about to drop the column `sourceLocation` on the `imports` table. All the data in the column will be lost.
  - You are about to drop the column `sourceType` on the `imports` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."imports" DROP COLUMN "provider",
DROP COLUMN "sourceLocation",
DROP COLUMN "sourceType",
ALTER COLUMN "config" DROP DEFAULT;
