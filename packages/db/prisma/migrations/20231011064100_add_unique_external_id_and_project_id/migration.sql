/*
  Warnings:

  - A unique constraint covering the columns `[project_id,external_id]` on the table `profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "profiles_project_id_external_id_key" ON "profiles"("project_id", "external_id");
