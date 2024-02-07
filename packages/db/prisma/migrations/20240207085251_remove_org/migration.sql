/*
  Warnings:

  - You are about to drop the column `organization_id` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `organization_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `organization_id` on the `recent_dashboards` table. All the data in the column will be lost.
  - You are about to drop the `invites` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `organizations` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `organization_slug` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_slug` to the `projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_slug` to the `recent_dashboards` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_fkey";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "organization_id",
ADD COLUMN     "organization_slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "organization_id",
ADD COLUMN     "organization_slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "recent_dashboards" DROP COLUMN "organization_id",
ADD COLUMN     "organization_slug" TEXT NOT NULL;

-- DropTable
DROP TABLE "invites";

-- DropTable
DROP TABLE "organizations";
