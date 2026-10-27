-- AlterTable
ALTER TABLE "public"."dashboards" ADD COLUMN     "filters" JSONB NOT NULL DEFAULT '[]';
