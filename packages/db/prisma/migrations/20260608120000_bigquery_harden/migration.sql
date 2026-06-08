-- Phase 1 hardening: production-grade fields for BigQuery connector

-- BigQueryConnection: region (GDPR compliance) + connection health tracking
ALTER TABLE "public"."bigquery_connections" ADD COLUMN "gcpRegion" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "public"."bigquery_connections" ADD COLUMN "lastTestedAt" TIMESTAMP(3);
ALTER TABLE "public"."bigquery_connections" ADD COLUMN "lastTestStatus" BOOLEAN;

-- BigQuerySync: typed status enum, circuit-breaker fields, partition filter
ALTER TABLE "public"."bigquery_syncs" ALTER COLUMN "lastSyncStatus" TYPE "public"."BigQuerySyncRunStatus" USING "lastSyncStatus"::"public"."BigQuerySyncRunStatus";
ALTER TABLE "public"."bigquery_syncs" ADD COLUMN "errorRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."bigquery_syncs" ADD COLUMN "isErrorPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."bigquery_syncs" ADD COLUMN "partitionFilter" TEXT;

-- BigQuerySyncRun: BigInt rowCount (INT max ~2.1B insufficient for large tables), bytes for cost tracking
ALTER TABLE "public"."bigquery_sync_runs" ALTER COLUMN "rowCount" TYPE BIGINT USING "rowCount"::BIGINT;
ALTER TABLE "public"."bigquery_sync_runs" ADD COLUMN "bytesProcessed" BIGINT;
