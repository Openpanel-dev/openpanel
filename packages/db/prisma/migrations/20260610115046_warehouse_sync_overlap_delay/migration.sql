-- cursorOverlapMinutes: overlap window for append-mode cursor.
-- Rewinds the cursor by this many minutes to catch late-arriving rows that share
-- the same insertTime as the previous high-water mark. Worker handles dedup via
-- eventId (sha256 hash or user-mapped column) so no duplicate events are created.
ALTER TABLE "public"."warehouse_syncs"
    ADD COLUMN "cursorOverlapMinutes" INTEGER NOT NULL DEFAULT 10;

-- syncDelayMinutes: delay after scheduled fire time before running.
-- Allows pipeline data to fully land in BigQuery before the sync executes.
-- e.g. a daily sync firing at midnight waits N minutes for the ETL job to finish.
ALTER TABLE "public"."warehouse_syncs"
    ADD COLUMN "syncDelayMinutes" INTEGER NOT NULL DEFAULT 0;
