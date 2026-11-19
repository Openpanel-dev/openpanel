-- Invites created before projectScope existed got the column default `all`,
-- even when their projectAccess restricted them to selected projects. The api
-- accepts invites as soon as it serves, and code migrations only run after
-- that, so the conversion has to land here or an invite accepted in between
-- grants every project of the organization.
UPDATE "public"."invites"
SET "projectScope" = 'selected'
WHERE "projectScope" = 'all'
  AND jsonb_array_length("projectAccess") > 0;
