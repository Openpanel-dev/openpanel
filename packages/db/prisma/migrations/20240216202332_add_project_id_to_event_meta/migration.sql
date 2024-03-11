/*
  Warnings:

  - Added the required column `project_id` to the `event_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_meta" ADD COLUMN     "project_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "event_meta" ADD CONSTRAINT "event_meta_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
