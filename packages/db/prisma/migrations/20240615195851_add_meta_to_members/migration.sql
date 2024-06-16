-- AlterTable
ALTER TABLE "members" ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "meta" JSONB;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
