/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `dashboards` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "dashboards_slug_key" ON "dashboards"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
