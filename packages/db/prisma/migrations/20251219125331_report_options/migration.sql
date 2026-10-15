-- AlterEnum
ALTER TYPE "ChartType" ADD VALUE 'sankey';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "options" JSONB;
