-- AlterEnum
ALTER TYPE "public"."ChartType" ADD VALUE 'sankey';

-- AlterTable
ALTER TABLE "public"."reports" ADD COLUMN     "options" JSONB;
