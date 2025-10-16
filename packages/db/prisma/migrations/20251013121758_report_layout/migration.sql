-- AlterTable
ALTER TABLE "public"."_IntegrationToNotificationRule" ADD CONSTRAINT "_IntegrationToNotificationRule_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "public"."_IntegrationToNotificationRule_AB_unique";

-- CreateTable
CREATE TABLE "public"."report_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reportId" UUID NOT NULL,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "w" INTEGER NOT NULL DEFAULT 4,
    "h" INTEGER NOT NULL DEFAULT 3,
    "minW" INTEGER DEFAULT 2,
    "minH" INTEGER DEFAULT 2,
    "maxW" INTEGER,
    "maxH" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_layouts_reportId_key" ON "public"."report_layouts"("reportId");

-- AddForeignKey
ALTER TABLE "public"."report_layouts" ADD CONSTRAINT "report_layouts_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
