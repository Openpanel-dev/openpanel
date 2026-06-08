-- Allow multiple BigQuery connections per project (named connections)
-- Drop single-column unique index on projectId
DROP INDEX IF EXISTS "public"."bigquery_connections_projectId_key";

-- Add name column (default '' for any pre-existing rows during dev)
ALTER TABLE "public"."bigquery_connections" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

-- Remove the default now that column exists
ALTER TABLE "public"."bigquery_connections" ALTER COLUMN "name" DROP DEFAULT;

-- Add composite unique constraint: name must be unique within a project
CREATE UNIQUE INDEX "bigquery_connections_projectId_name_key" ON "public"."bigquery_connections"("projectId", "name");
