-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "project_access" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "shares" ADD COLUMN     "organizationId" TEXT;

-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
