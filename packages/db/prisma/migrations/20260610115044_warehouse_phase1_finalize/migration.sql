-- Phase 1 finalizing migration: performance indexes + column additions
-- These were identified as missing after the initial restructure.

-- Performance indexes on FK columns (PostgreSQL does NOT auto-create these).
-- Required for list queries: syncs-by-project, syncs-by-connection, runs-by-sync.
CREATE INDEX "warehouse_syncs_projectId_idx"
    ON "public"."warehouse_syncs"("projectId");

CREATE INDEX "warehouse_syncs_connectionId_idx"
    ON "public"."warehouse_syncs"("connectionId");

CREATE INDEX "warehouse_sync_runs_syncId_idx"
    ON "public"."warehouse_sync_runs"("syncId");

-- failureCount: tracks rows that were fetched but failed to import individually
-- (bad data, type mismatch, etc.) — separate from rowCount (successfully written rows).
-- Matches Mixpanel's Sync History "Failures" column in the UI.
ALTER TABLE "public"."warehouse_sync_runs"
    ADD COLUMN "failureCount" BIGINT NOT NULL DEFAULT 0;

-- createdBy: userId of the person who created this sync.
-- Used for displaying creator avatar + name in the sync list (matching Mixpanel UI).
ALTER TABLE "public"."warehouse_syncs"
    ADD COLUMN "createdBy" TEXT;
