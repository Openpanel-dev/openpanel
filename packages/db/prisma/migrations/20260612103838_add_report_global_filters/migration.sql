-- AlterTable
ALTER TABLE "public"."reports" ADD COLUMN     "globalFilters" JSONB NOT NULL DEFAULT '[]';
