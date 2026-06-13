-- Tenant isolation: enforce that a sync run's projectId must match
-- its parent sync's projectId. Mirrors the same pattern used on
-- warehouse_syncs → warehouse_connections (composite FK there too).

-- Step 1: unique index on warehouse_syncs(id, projectId) to back the FK
CREATE UNIQUE INDEX "warehouse_syncs_id_projectId_key"
    ON "public"."warehouse_syncs"("id", "projectId");

-- Step 2: replace single-column syncId FK with a composite (syncId, projectId) FK
--         so that a run row cannot carry a projectId that differs from its sync
ALTER TABLE "public"."warehouse_sync_runs"
    DROP CONSTRAINT "warehouse_sync_runs_syncId_fkey";

-- Backfill: normalize any runs whose projectId doesn't match their parent sync.
-- Defensive — tables are dev-only at this stage, but makes the migration
-- safe to apply to any environment that might have mismatched rows.
UPDATE "public"."warehouse_sync_runs" r
SET "projectId" = s."projectId"
FROM "public"."warehouse_syncs" s
WHERE s."id" = r."syncId"
  AND r."projectId" IS DISTINCT FROM s."projectId";

ALTER TABLE "public"."warehouse_sync_runs"
    ADD CONSTRAINT "warehouse_sync_runs_syncId_projectId_fkey"
    FOREIGN KEY ("syncId", "projectId")
    REFERENCES "public"."warehouse_syncs"("id", "projectId")
    ON DELETE CASCADE ON UPDATE CASCADE;
