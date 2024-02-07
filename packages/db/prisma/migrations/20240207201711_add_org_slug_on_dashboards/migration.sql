/*
  Warnings:

  - You are about to drop the `event_failed` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recent_dashboards` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `organization_slug` to the `dashboards` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "recent_dashboards" DROP CONSTRAINT "recent_dashboards_dashboard_id_fkey";

-- DropForeignKey
ALTER TABLE "recent_dashboards" DROP CONSTRAINT "recent_dashboards_project_id_fkey";

-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN     "organization_slug" TEXT NOT NULL;

-- DropTable
DROP TABLE "event_failed";

-- DropTable
DROP TABLE "recent_dashboards";
