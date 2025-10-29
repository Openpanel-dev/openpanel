-- CreateTable
CREATE TABLE "shares_dashboards" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "shares_dashboards_id_key" ON "shares_dashboards"("id");

-- CreateIndex
CREATE UNIQUE INDEX "shares_dashboards_dashboardId_key" ON "shares_dashboards"("dashboardId");

-- AddForeignKey
ALTER TABLE "shares_dashboards" ADD CONSTRAINT "shares_dashboards_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares_dashboards" ADD CONSTRAINT "shares_dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
