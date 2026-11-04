-- AlterTable
ALTER TABLE "public"."accounts" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "idToken" TEXT;

-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "token" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "public"."verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "public"."verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "public"."sessions"("token");

-- Fold project_access into member_projects the way the previous build read
-- them: a member with project_access rows has exactly those projects, read
-- where any duplicate row says read. The previous build kept both tables in
-- step, so this only matters for grants written by older pods mid-deploy.
-- Done here because code migrations run after this file drops the table.
CREATE TEMPORARY TABLE "legacy_grants" AS
SELECT m.id AS "memberId", pa."projectId",
  CASE WHEN bool_or(pa.level = 'read') THEN 'read'::"public"."AccessLevel" END AS "level"
FROM "public"."project_access" pa
JOIN "public"."members" m
  ON m."userId" = pa."userId"
 AND m."organizationId" = pa."organizationId"
GROUP BY m.id, pa."projectId";

UPDATE "public"."members"
SET "projectScope" = 'selected'
WHERE id IN (SELECT "memberId" FROM "legacy_grants");

DELETE FROM "public"."member_projects" mp
WHERE mp."memberId" IN (SELECT "memberId" FROM "legacy_grants")
  AND NOT EXISTS (
    SELECT 1 FROM "legacy_grants" lg
    WHERE lg."memberId" = mp."memberId" AND lg."projectId" = mp."projectId"
  );

INSERT INTO "public"."member_projects" ("memberId", "projectId", "level")
SELECT "memberId", "projectId", "level" FROM "legacy_grants"
ON CONFLICT ("memberId", "projectId") DO UPDATE SET "level" = EXCLUDED."level";

-- DropTable
DROP TABLE "public"."project_access";

DROP TABLE "legacy_grants";
