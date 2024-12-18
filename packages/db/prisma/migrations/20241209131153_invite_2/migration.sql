/*
  Warnings:

  - Added the required column `role` to the `invites` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "role" TEXT NOT NULL;
