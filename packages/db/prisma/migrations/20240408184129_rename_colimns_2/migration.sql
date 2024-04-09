-- RenameForeignKey
ALTER TABLE "clients" RENAME CONSTRAINT "clients_project_id_fkey" TO "clients_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "dashboards" RENAME CONSTRAINT "dashboards_project_id_fkey" TO "dashboards_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "event_meta" RENAME CONSTRAINT "event_meta_project_id_fkey" TO "event_meta_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "events" RENAME CONSTRAINT "events_project_id_fkey" TO "events_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "profiles" RENAME CONSTRAINT "profiles_project_id_fkey" TO "profiles_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "project_access" RENAME CONSTRAINT "project_access_project_id_fkey" TO "project_access_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "references" RENAME CONSTRAINT "references_project_id_fkey" TO "references_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "reports" RENAME CONSTRAINT "reports_dashboard_id_fkey" TO "reports_dashboardId_fkey";

-- RenameForeignKey
ALTER TABLE "reports" RENAME CONSTRAINT "reports_project_id_fkey" TO "reports_projectId_fkey";

-- RenameForeignKey
ALTER TABLE "shares" RENAME CONSTRAINT "shares_project_id_fkey" TO "shares_projectId_fkey";

-- RenameIndex
ALTER INDEX "event_meta_name_project_id_key" RENAME TO "event_meta_name_projectId_key";

-- RenameIndex
ALTER INDEX "shares_project_id_key" RENAME TO "shares_projectId_key";
