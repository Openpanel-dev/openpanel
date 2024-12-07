/*
  Warnings:

  - The `cors` column on the `projects` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "cors",
ADD COLUMN     "cors" TEXT[] DEFAULT ARRAY[]::TEXT[];
