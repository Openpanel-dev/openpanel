/*
  Warnings:

  - Added the required column `name` to the `reports` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "name" TEXT NOT NULL;
