/*
  Warnings:

  - A unique constraint covering the columns `[name,project_id]` on the table `event_meta` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "event_meta_name_project_id_key" ON "event_meta"("name", "project_id");
