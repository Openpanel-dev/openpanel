/*
  Warnings:

  - You are about to drop the column `name` on the `profiles` table. All the data in the column will be lost.
  - Added the required column `profile_id` to the `profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "name",
ADD COLUMN     "profile_id" TEXT NOT NULL;
