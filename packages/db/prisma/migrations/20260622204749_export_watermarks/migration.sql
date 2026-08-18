-- CreateTable
CREATE TABLE "public"."export_watermarks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "integrationId" UUID NOT NULL,
    "lastInsertedAt" TIMESTAMP(3) NOT NULL,
    "lastEventId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_watermarks_integrationId_idx" ON "public"."export_watermarks"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "export_watermarks_projectId_integrationId_key" ON "public"."export_watermarks"("projectId", "integrationId");

-- AddForeignKey
ALTER TABLE "public"."export_watermarks" ADD CONSTRAINT "export_watermarks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."export_watermarks" ADD CONSTRAINT "export_watermarks_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
