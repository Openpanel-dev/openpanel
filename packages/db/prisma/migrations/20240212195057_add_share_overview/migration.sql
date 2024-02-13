-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_slug" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "shares_id_key" ON "shares"("id");

-- CreateIndex
CREATE UNIQUE INDEX "shares_project_id_key" ON "shares"("project_id");

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
