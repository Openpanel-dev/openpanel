-- Metric charts have always rendered the total unique count, but `count` had no
-- home in the enum, so `report.create`/`report.update` silently rewrote it to
-- `sum`. Add the value so a picked aggregation can actually persist.
--
-- This must be its own migration: Postgres refuses to use a new enum value in
-- the same transaction that added it ("unsafe use of new value ... of enum
-- type Metric"). The backfill lives in the next migration.
ALTER TYPE "Metric" ADD VALUE 'count';
