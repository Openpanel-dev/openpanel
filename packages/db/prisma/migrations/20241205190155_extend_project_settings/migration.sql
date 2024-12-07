-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "cors" TEXT,
ADD COLUMN     "crossDomain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "filters" JSONB NOT NULL DEFAULT '[]';
