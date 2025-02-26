-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "deleteAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "deleteAt" TIMESTAMP(3);
