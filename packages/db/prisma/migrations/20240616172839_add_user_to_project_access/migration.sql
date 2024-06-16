-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
