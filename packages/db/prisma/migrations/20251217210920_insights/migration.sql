/*
  Warnings:

  - You are about to drop the column `changePct` on the `project_insights` table. All the data in the column will be lost.
  - You are about to drop the column `compareValue` on the `project_insights` table. All the data in the column will be lost.
  - You are about to drop the column `currentValue` on the `project_insights` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."project_insights" DROP COLUMN "changePct",
DROP COLUMN "compareValue",
DROP COLUMN "currentValue",
ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT '';
