-- AlterTable
ALTER TABLE "public"."reports" ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "visibleSeries" TEXT[];
