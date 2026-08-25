-- `Invite.projectAccess` was a text[] of project ids, so an invite could say
-- WHICH projects the new member gets but not at WHAT level - the level was
-- decided later by whichever code path happened to create the ProjectAccess
-- rows. Now that the level is enforced, an admin has to be able to express it
-- at invite time, so the column carries [{ projectId, level }].
--
-- Existing pending invites are converted to the level that accepting them
-- would have produced anyway ('write', from connectUserToOrganization), so no
-- pending invite changes meaning.
ALTER TABLE "invites" ADD COLUMN "projectAccess_json" JSONB NOT NULL DEFAULT '[]';

UPDATE "invites"
SET "projectAccess_json" = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('projectId', pid, 'level', 'write'))
    FROM unnest("projectAccess") AS pid
  ),
  '[]'::jsonb
);

ALTER TABLE "invites" DROP COLUMN "projectAccess";
ALTER TABLE "invites" RENAME COLUMN "projectAccess_json" TO "projectAccess";
