-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cors" TEXT NOT NULL DEFAULT '*',
ALTER COLUMN "secret" DROP NOT NULL;
