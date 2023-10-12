-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_profile_id_fkey";

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "profile_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
