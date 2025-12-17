/*
  Warnings:

  - Made the column `payload` on table `project_insights` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."project_insights" ALTER COLUMN "payload" SET NOT NULL,
ALTER COLUMN "payload" SET DEFAULT '{}';
