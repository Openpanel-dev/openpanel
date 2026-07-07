/*
  Warnings:

  - Added the required column `createdById` to the `dashboards` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."DashboardAccessLevel" AS ENUM ('view', 'edit');

-- AlterTable
ALTER TABLE "public"."dashboards" ADD COLUMN     "createdById" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."dashboard_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "public"."DashboardAccessLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_access_dashboardId_userId_key" ON "public"."dashboard_access"("dashboardId", "userId");

-- AddForeignKey
ALTER TABLE "public"."dashboards" ADD CONSTRAINT "dashboards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dashboard_access" ADD CONSTRAINT "dashboard_access_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "public"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dashboard_access" ADD CONSTRAINT "dashboard_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
