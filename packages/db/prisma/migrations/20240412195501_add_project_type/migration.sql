-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('website', 'app', 'backend');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "types" "ProjectType"[] DEFAULT ARRAY[]::"ProjectType"[];
