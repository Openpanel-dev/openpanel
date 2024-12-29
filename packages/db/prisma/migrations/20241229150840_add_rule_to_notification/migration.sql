-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "notificationRuleId" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_notificationRuleId_fkey" FOREIGN KEY ("notificationRuleId") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
