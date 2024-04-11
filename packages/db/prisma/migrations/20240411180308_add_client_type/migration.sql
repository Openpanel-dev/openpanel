-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('read', 'write', 'root');

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_projectId_fkey";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "type" "ClientType" NOT NULL DEFAULT 'read',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
