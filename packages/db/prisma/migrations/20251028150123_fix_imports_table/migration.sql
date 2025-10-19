/*
  Warnings:

  - Changed the type of `status` on the `imports` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `currentStep` on table `imports` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."ImportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "public"."imports" DROP COLUMN "status",
ADD COLUMN     "status" "public"."ImportStatus" NOT NULL,
ALTER COLUMN "currentStep" SET NOT NULL;
