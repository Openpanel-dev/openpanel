-- `Invite.projectAccess` was a text[] of project ids, so an invite could say
-- WHICH projects the new member gets but not at WHAT level - the level was
-- decided later by whichever code path happened to create the ProjectAccess
-- rows. Now that the level is enforced, an admin has to be able to express it
-- at invite time, so the column carries [{ projectId, level }].
--
-- This migration is DDL only, and deliberately NON-DESTRUCTIVE: it parks the
-- old values in "projectAccess_legacy" rather than dropping them. The data
-- conversion lives in code-migration 20-invite-project-access-levels.ts, which
-- validates each grant against zProjectAccessGrant, reports anything it cannot
-- resolve, and drops the legacy column once it has converted everything.
--
-- Why split it: `pnpm migrate:deploy` runs `prisma migrate deploy` before
-- `migrate:deploy:code`, so anything this file drops is gone before the code
-- migration ever sees it. Parking the column is what lets the conversion be a
-- code migration at all - and it doubles as the rollback, since the original
-- values are still on the table until step 20 finishes.
ALTER TABLE "invites" RENAME COLUMN "projectAccess" TO "projectAccess_legacy";

ALTER TABLE "invites" ADD COLUMN "projectAccess" JSONB NOT NULL DEFAULT '[]';
