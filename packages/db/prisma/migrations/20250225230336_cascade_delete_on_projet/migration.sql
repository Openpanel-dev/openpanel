-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_projectId_fkey";

-- DropForeignKey
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_projectId_fkey";

-- DropForeignKey
ALTER TABLE "event_meta" DROP CONSTRAINT "event_meta_projectId_fkey";

-- DropForeignKey
ALTER TABLE "notification_rules" DROP CONSTRAINT "notification_rules_projectId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_projectId_fkey";

-- DropForeignKey
ALTER TABLE "references" DROP CONSTRAINT "references_projectId_fkey";

-- DropForeignKey
ALTER TABLE "shares" DROP CONSTRAINT "shares_projectId_fkey";

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_meta" ADD CONSTRAINT "event_meta_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
