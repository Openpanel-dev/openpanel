-- Add lastTestError to warehouse_connections so that failed connectivity tests
-- can surface a human-readable reason (permission denied, project not found, etc.)
-- rather than just a boolean false in lastTestStatus.
ALTER TABLE "public"."warehouse_connections"
    ADD COLUMN "lastTestError" TEXT;
