-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_organizationId_fkey";

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
