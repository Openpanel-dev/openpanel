-- Add 'onetime' sync mode: run once immediately, then disable automatically.
-- Used for historical backfills — import all historical data once, then set up
-- an Append sync for ongoing data.
ALTER TYPE "public"."WarehouseSyncMode" ADD VALUE 'onetime';

-- Make schedule nullable: onetime syncs have no recurring schedule.
ALTER TABLE "public"."warehouse_syncs"
    ALTER COLUMN "schedule" DROP NOT NULL;
