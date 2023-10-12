/*
  Warnings:

  - You are about to drop the column `profile_id` on the `profiles` table. All the data in the column will be lost.
  - Added the required column `external_id` to the `profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "profile_id",
ADD COLUMN     "external_id" TEXT NOT NULL;
