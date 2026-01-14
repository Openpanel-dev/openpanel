-- CreateTable
CREATE TABLE "public"."share_dashboards" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "public"."share_reports" (
    "id" TEXT NOT NULL,
    "reportId" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "share_dashboards_id_key" ON "public"."share_dashboards"("id");

-- CreateIndex
CREATE UNIQUE INDEX "share_dashboards_dashboardId_key" ON "public"."share_dashboards"("dashboardId");

-- CreateIndex
CREATE UNIQUE INDEX "share_reports_id_key" ON "public"."share_reports"("id");

-- CreateIndex
CREATE UNIQUE INDEX "share_reports_reportId_key" ON "public"."share_reports"("reportId");

-- AddForeignKey
ALTER TABLE "public"."share_dashboards" ADD CONSTRAINT "share_dashboards_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "public"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_dashboards" ADD CONSTRAINT "share_dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_dashboards" ADD CONSTRAINT "share_dashboards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_reports" ADD CONSTRAINT "share_reports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_reports" ADD CONSTRAINT "share_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_reports" ADD CONSTRAINT "share_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
