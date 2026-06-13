-- CreateEnum
CREATE TYPE "public"."BigQuerySyncMappingType" AS ENUM ('events', 'profiles');

-- CreateEnum
CREATE TYPE "public"."BigQuerySyncMode" AS ENUM ('append', 'full');

-- CreateEnum
CREATE TYPE "public"."BigQuerySyncSchedule" AS ENUM ('hourly', 'daily', 'weekly');

-- CreateEnum
CREATE TYPE "public"."BigQuerySyncRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "public"."bigquery_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "gcpProjectId" TEXT NOT NULL,
    "serviceAccountEmail" TEXT NOT NULL,
    "serviceAccountJsonEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bigquery_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bigquery_syncs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connectionId" UUID NOT NULL,
    "projectId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "mappingType" "public"."BigQuerySyncMappingType" NOT NULL,
    "syncMode" "public"."BigQuerySyncMode" NOT NULL,
    "schedule" "public"."BigQuerySyncSchedule" NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "lastCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bigquery_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bigquery_sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "syncId" UUID NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."BigQuerySyncRunStatus" NOT NULL DEFAULT 'pending',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "bigquery_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bigquery_connections_projectId_key" ON "public"."bigquery_connections"("projectId");

-- AddForeignKey
ALTER TABLE "public"."bigquery_connections" ADD CONSTRAINT "bigquery_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bigquery_syncs" ADD CONSTRAINT "bigquery_syncs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."bigquery_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bigquery_syncs" ADD CONSTRAINT "bigquery_syncs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bigquery_sync_runs" ADD CONSTRAINT "bigquery_sync_runs_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "public"."bigquery_syncs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
