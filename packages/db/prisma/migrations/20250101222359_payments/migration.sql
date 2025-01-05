-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "subscriptionCreatedByUserId" TEXT,
ADD COLUMN     "subscriptionCustomerId" TEXT,
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "subscriptionPriceId" TEXT,
ADD COLUMN     "subscriptionProductId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_subscriptionCreatedByUserId_fkey" FOREIGN KEY ("subscriptionCreatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
