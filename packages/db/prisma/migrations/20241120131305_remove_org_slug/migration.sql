/*
  Warnings:

  - You are about to drop the column `organizationSlug` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `organizationSlug` on the `dashboards` table. All the data in the column will be lost.
  - You are about to drop the column `organizationSlug` on the `project_access` table. All the data in the column will be lost.
  - You are about to drop the column `organizationSlug` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `organizationSlug` on the `shares` table. All the data in the column will be lost.
  - Made the column `organizationId` on table `clients` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `dashboards` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `project_access` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `projects` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `shares` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "project_access" DROP CONSTRAINT "project_access_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "shares" DROP CONSTRAINT "shares_organizationId_fkey";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "organizationSlug",
ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "dashboards" DROP COLUMN "organizationSlug",
ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "project_access" DROP COLUMN "organizationSlug",
ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "organizationSlug",
ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "shares" DROP COLUMN "organizationSlug",
ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
