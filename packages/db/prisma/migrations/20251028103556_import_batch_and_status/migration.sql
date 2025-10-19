-- AlterTable
ALTER TABLE "public"."imports" ADD COLUMN     "currentBatch" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStep" TEXT;
