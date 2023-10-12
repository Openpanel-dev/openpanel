-- DropIndex
DROP INDEX "profiles_project_id_external_id_key";

-- AlterTable
ALTER TABLE "profiles" ALTER COLUMN "external_id" DROP NOT NULL;
