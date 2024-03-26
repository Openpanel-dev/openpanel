/*
  Warnings:

  - Added the required column `organization_slug` to the `project_access` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "project_access" ADD COLUMN     "organization_slug" TEXT NOT NULL;
