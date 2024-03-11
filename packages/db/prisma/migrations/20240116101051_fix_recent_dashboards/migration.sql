/*
  Warnings:

  - You are about to drop the column `userId` on the `recent_dashboards` table. All the data in the column will be lost.
  - Changed the type of `user_id` on the `recent_dashboards` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "recent_dashboards" DROP CONSTRAINT "recent_dashboards_userId_fkey";

-- AlterTable
ALTER TABLE "recent_dashboards" DROP COLUMN "userId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "recent_dashboards" ADD CONSTRAINT "recent_dashboards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
