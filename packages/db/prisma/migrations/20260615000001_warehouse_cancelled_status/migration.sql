-- Add 'cancelled' value to WarehouseSyncRunStatus enum for Phase 4 sync cancellation support.
-- Kept in its own migration: ALTER TYPE ... ADD VALUE cannot be combined with other DDL
-- in a single transaction on older PostgreSQL versions.
ALTER TYPE "WarehouseSyncRunStatus" ADD VALUE 'cancelled';
