-- Restructure: BigQuery-specific tables → generic Warehouse tables
-- Phase 1 tables are dev-only (no production data) — drop and recreate cleanly.
-- This makes the schema ready for BigQuery, Snowflake, Redshift, Databricks, Postgres.

-- Drop old tables (CASCADE removes all FKs and indexes automatically)
DROP TABLE IF EXISTS "public"."bigquery_sync_runs";
DROP TABLE IF EXISTS "public"."bigquery_syncs";
DROP TABLE IF EXISTS "public"."bigquery_connections";

-- Drop old BigQuery-specific enums
DROP TYPE IF EXISTS "public"."BigQuerySyncMappingType";
DROP TYPE IF EXISTS "public"."BigQuerySyncMode";
DROP TYPE IF EXISTS "public"."BigQuerySyncSchedule";
DROP TYPE IF EXISTS "public"."BigQuerySyncRunStatus";

-- WarehouseType: all supported warehouse providers
CREATE TYPE "public"."WarehouseType" AS ENUM ('bigquery', 'snowflake', 'redshift', 'databricks', 'postgres');

-- Shared sync enums (provider-agnostic)
CREATE TYPE "public"."WarehouseSyncMappingType" AS ENUM ('events', 'profiles');
CREATE TYPE "public"."WarehouseSyncMode" AS ENUM ('append', 'full');
CREATE TYPE "public"."WarehouseSyncSchedule" AS ENUM ('hourly', 'daily', 'weekly');
CREATE TYPE "public"."WarehouseSyncRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- warehouse_connections: one row per named connection, any provider
-- configEncrypted: AES-256-GCM encrypted JSON (shape validated by zWarehouseConfig discriminated union)
-- displayIdentifier: plain-text for UI display without decryption (GCP project ID / Snowflake account / etc.)
-- displayEmail: plain-text for UI display (SA email / username)
CREATE TABLE "public"."warehouse_connections" (
    "id"                UUID      NOT NULL DEFAULT gen_random_uuid(),
    "projectId"         TEXT      NOT NULL,
    "name"              TEXT      NOT NULL,
    "type"              "public"."WarehouseType" NOT NULL,
    "configEncrypted"   TEXT      NOT NULL,
    "displayIdentifier" TEXT,
    "displayEmail"      TEXT,
    "lastTestedAt"      TIMESTAMP(3),
    "lastTestStatus"    BOOLEAN,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouse_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."warehouse_syncs" (
    "id"              UUID      NOT NULL DEFAULT gen_random_uuid(),
    "connectionId"    UUID      NOT NULL,
    "projectId"       TEXT      NOT NULL,
    "displayName"     TEXT      NOT NULL,
    "dataset"         TEXT      NOT NULL,
    "tableName"       TEXT      NOT NULL,
    "mappingType"     "public"."WarehouseSyncMappingType" NOT NULL,
    "syncMode"        "public"."WarehouseSyncMode" NOT NULL,
    "schedule"        "public"."WarehouseSyncSchedule" NOT NULL,
    "columnMapping"   JSONB     NOT NULL,
    "lastCursor"      TEXT,
    "lastSyncedAt"    TIMESTAMP(3),
    "lastSyncStatus"  "public"."WarehouseSyncRunStatus",
    "lastSyncError"   TEXT,
    "isEnabled"       BOOLEAN   NOT NULL DEFAULT true,
    "errorRetryCount" INTEGER   NOT NULL DEFAULT 0,
    "isErrorPaused"   BOOLEAN   NOT NULL DEFAULT false,
    "partitionFilter" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouse_syncs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."warehouse_sync_runs" (
    "id"             UUID      NOT NULL DEFAULT gen_random_uuid(),
    "syncId"         UUID      NOT NULL,
    "projectId"      TEXT      NOT NULL,
    "status"         "public"."WarehouseSyncRunStatus" NOT NULL DEFAULT 'pending',
    "rowCount"       BIGINT    NOT NULL DEFAULT 0,
    "bytesProcessed" BIGINT,
    "errorMessage"   TEXT,
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"    TIMESTAMP(3),
    CONSTRAINT "warehouse_sync_runs_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
-- (projectId, name): connection name must be unique per project, across ALL warehouse types
CREATE UNIQUE INDEX "warehouse_connections_projectId_name_key"
    ON "public"."warehouse_connections"("projectId", "name");

-- (projectId, id): backs the composite FK on warehouse_syncs for cross-tenant protection
CREATE UNIQUE INDEX "warehouse_connections_projectId_id_key"
    ON "public"."warehouse_connections"("projectId", "id");

-- DB-level name nonempty (belt-and-suspenders; Zod blocks empty strings at app layer)
ALTER TABLE "public"."warehouse_connections"
    ADD CONSTRAINT "warehouse_connections_name_nonempty_check"
    CHECK (char_length("name") > 0);

-- FKs on warehouse_connections
ALTER TABLE "public"."warehouse_connections"
    ADD CONSTRAINT "warehouse_connections_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FKs on warehouse_syncs
ALTER TABLE "public"."warehouse_syncs"
    ADD CONSTRAINT "warehouse_syncs_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "public"."warehouse_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."warehouse_syncs"
    ADD CONSTRAINT "warehouse_syncs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK: prevents cross-tenant exploit where a sync in project A
-- could reference a connection belonging to project B
ALTER TABLE "public"."warehouse_syncs"
    ADD CONSTRAINT "warehouse_syncs_projectId_connectionId_fkey"
    FOREIGN KEY ("projectId", "connectionId")
    REFERENCES "public"."warehouse_connections"("projectId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FKs on warehouse_sync_runs
ALTER TABLE "public"."warehouse_sync_runs"
    ADD CONSTRAINT "warehouse_sync_runs_syncId_fkey"
    FOREIGN KEY ("syncId") REFERENCES "public"."warehouse_syncs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."warehouse_sync_runs"
    ADD CONSTRAINT "warehouse_sync_runs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
