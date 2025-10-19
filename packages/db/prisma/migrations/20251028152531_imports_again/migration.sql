-- AlterTable
ALTER TABLE "public"."imports" ALTER COLUMN "currentBatch" DROP NOT NULL,
ALTER COLUMN "currentBatch" DROP DEFAULT,
ALTER COLUMN "currentBatch" SET DATA TYPE TEXT;
