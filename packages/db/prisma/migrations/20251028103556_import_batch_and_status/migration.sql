-- AlterTable
ALTER TABLE "imports" ADD COLUMN     "currentBatch" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStep" TEXT;
