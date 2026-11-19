-- CreateEnum
CREATE TYPE "public"."ProjectScope" AS ENUM ('all', 'selected');

-- AlterTable
ALTER TABLE "public"."invites" ADD COLUMN     "projectScope" "public"."ProjectScope" NOT NULL DEFAULT 'all';

-- AlterTable
ALTER TABLE "public"."members" ADD COLUMN     "projectScope" "public"."ProjectScope" NOT NULL DEFAULT 'all';

-- AlterTable
ALTER TABLE "public"."organizations" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "public"."member_projects" (
    "memberId" UUID NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" "public"."AccessLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_projects_pkey" PRIMARY KEY ("memberId","projectId")
);

-- CreateIndex
CREATE INDEX "member_projects_projectId_idx" ON "public"."member_projects"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations"("slug");

-- AddForeignKey
ALTER TABLE "public"."member_projects" ADD CONSTRAINT "member_projects_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."member_projects" ADD CONSTRAINT "member_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

