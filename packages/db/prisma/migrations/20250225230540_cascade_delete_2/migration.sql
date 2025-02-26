-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_projectId_fkey";

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
