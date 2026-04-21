-- CreateTable
CREATE TABLE "public"."cohorts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "isStatic" BOOLEAN NOT NULL DEFAULT false,
    "profileCount" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cohorts_projectId_idx" ON "public"."cohorts"("projectId");

-- AddForeignKey
ALTER TABLE "public"."cohorts" ADD CONSTRAINT "cohorts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
