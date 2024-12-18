/*
  Warnings:

  - Added the required column `accountId` to the `reset_password` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "reset_password" ADD COLUMN     "accountId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "reset_password" ADD CONSTRAINT "reset_password_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
