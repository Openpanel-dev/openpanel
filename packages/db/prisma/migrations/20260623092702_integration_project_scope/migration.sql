-- AlterTable
ALTER TABLE "public"."integrations" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "integrations_organizationId_idx" ON "public"."integrations"("organizationId");

-- CreateIndex
CREATE INDEX "integrations_projectId_idx" ON "public"."integrations"("projectId");

-- AddForeignKey
ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
