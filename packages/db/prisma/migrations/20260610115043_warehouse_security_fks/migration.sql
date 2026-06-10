-- Drop the single-field connectionId FK on warehouse_syncs.
-- The composite FK (projectId, connectionId) → warehouse_connections(projectId, id)
-- from 20260610115042_warehouse_restructure already enforces the same referential
-- integrity PLUS prevents cross-tenant access — keeping both would be redundant.
ALTER TABLE "public"."warehouse_syncs"
  DROP CONSTRAINT "warehouse_syncs_connectionId_fkey";
