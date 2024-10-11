/*
  Warnings:

  - You are about to drop the `_IntegrationToNotificationControl` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_IntegrationToNotificationControl" DROP CONSTRAINT "_IntegrationToNotificationControl_A_fkey";

-- DropForeignKey
ALTER TABLE "_IntegrationToNotificationControl" DROP CONSTRAINT "_IntegrationToNotificationControl_B_fkey";

-- DropForeignKey
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_projectId_fkey";

-- DropTable
DROP TABLE "_IntegrationToNotificationControl";

-- DropTable
DROP TABLE "notification_settings";

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "sendToApp" BOOLEAN NOT NULL DEFAULT false,
    "sendToEmail" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_IntegrationToNotificationRule" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_IntegrationToNotificationRule_AB_unique" ON "_IntegrationToNotificationRule"("A", "B");

-- CreateIndex
CREATE INDEX "_IntegrationToNotificationRule_B_index" ON "_IntegrationToNotificationRule"("B");

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IntegrationToNotificationRule" ADD CONSTRAINT "_IntegrationToNotificationRule_A_fkey" FOREIGN KEY ("A") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IntegrationToNotificationRule" ADD CONSTRAINT "_IntegrationToNotificationRule_B_fkey" FOREIGN KEY ("B") REFERENCES "notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
