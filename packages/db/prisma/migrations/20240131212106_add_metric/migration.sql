-- CreateEnum
CREATE TYPE "Metric" AS ENUM ('sum', 'average', 'min', 'max');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "metric" "Metric" NOT NULL DEFAULT 'sum',
ADD COLUMN     "unit" TEXT;
