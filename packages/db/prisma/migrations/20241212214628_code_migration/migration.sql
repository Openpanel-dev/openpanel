/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `__code_migrations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "__code_migrations_name_key" ON "__code_migrations"("name");
