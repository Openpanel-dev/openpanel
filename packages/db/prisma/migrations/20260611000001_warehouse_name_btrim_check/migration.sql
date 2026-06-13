-- Tighten the name nonempty check on warehouse_connections.
-- The previous constraint used char_length(name) > 0, which passes
-- whitespace-only strings like '   ' (char_length returns 3).
-- btrim strips leading/trailing whitespace before the length check,
-- so '   ' → '' → char_length 0 → rejected.
ALTER TABLE "public"."warehouse_connections"
    DROP CONSTRAINT "warehouse_connections_name_nonempty_check";

ALTER TABLE "public"."warehouse_connections"
    ADD CONSTRAINT "warehouse_connections_name_nonempty_check"
    CHECK (char_length(btrim("name")) > 0);
