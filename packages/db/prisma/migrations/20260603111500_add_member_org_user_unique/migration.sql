-- Remove duplicate memberships before enforcing uniqueness.
-- Keep the earliest-created row per (organizationId, userId); tie-break on id.
-- Rows with a NULL userId (pending email-only invites) are left untouched
-- because NULLs are treated as distinct by the unique index below.
DELETE FROM "public"."members" m
USING "public"."members" keep
WHERE m."userId" IS NOT NULL
  AND m."organizationId" = keep."organizationId"
  AND m."userId" = keep."userId"
  AND (
    m."createdAt" > keep."createdAt"
    OR (m."createdAt" = keep."createdAt" AND m."id" > keep."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "members_organizationId_userId_key" ON "public"."members"("organizationId", "userId");
