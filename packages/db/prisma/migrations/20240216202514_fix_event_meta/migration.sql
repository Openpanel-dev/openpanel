-- AlterTable
ALTER TABLE "event_meta" ADD COLUMN     "color" TEXT,
ADD COLUMN     "icon" TEXT,
ALTER COLUMN "conversion" DROP NOT NULL;
