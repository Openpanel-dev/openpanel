-- Fix 1: Add FK on bigquery_sync_runs.projectId (was missing, allowing orphan runs)
ALTER TABLE "public"."bigquery_sync_runs"
  ADD CONSTRAINT "bigquery_sync_runs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fix 2: Cross-tenant vulnerability — enforce connection belongs to same project as sync
-- Requires a unique index on (projectId, id) in bigquery_connections to back the composite FK
CREATE UNIQUE INDEX "bigquery_connections_projectId_id_key"
  ON "public"."bigquery_connections"("projectId", "id");

-- Add composite FK on bigquery_syncs: (projectId, connectionId) must match a connection
-- that belongs to the same project. This is an additional constraint on top of Prisma's
-- single-column connectionId FK — both coexist for defence in depth.
ALTER TABLE "public"."bigquery_syncs"
  ADD CONSTRAINT "bigquery_syncs_projectId_connectionId_fkey"
  FOREIGN KEY ("projectId", "connectionId")
  REFERENCES "public"."bigquery_connections"("projectId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Fix 3: Prevent empty-string connection names at the DB level
-- (Zod already blocks this at the application layer; this is belt-and-suspenders)
-- Backfill any dev rows that got the empty-string default from the prior migration
UPDATE "public"."bigquery_connections"
  SET "name" = concat('connection_', "id")
  WHERE char_length("name") = 0;

ALTER TABLE "public"."bigquery_connections"
  ADD CONSTRAINT "bigquery_connections_name_nonempty_check"
  CHECK (char_length("name") > 0);
