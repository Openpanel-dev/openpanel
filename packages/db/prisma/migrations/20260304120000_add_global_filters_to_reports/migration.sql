-- AlterTable
ALTER TABLE "reports" ADD COLUMN "globalFilters" JSONB NOT NULL DEFAULT '[]';
