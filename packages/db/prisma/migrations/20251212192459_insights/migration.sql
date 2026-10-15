-- CreateEnum
CREATE TYPE "InsightState" AS ENUM ('active', 'suppressed', 'closed');

-- CreateTable
CREATE TABLE "project_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "windowKind" TEXT NOT NULL,
    "state" "InsightState" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB,
    "currentValue" DOUBLE PRECISION,
    "compareValue" DOUBLE PRECISION,
    "changePct" DOUBLE PRECISION,
    "direction" TEXT,
    "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severityBand" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "threadId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "insightId" UUID NOT NULL,
    "eventKind" TEXT NOT NULL,
    "changeFrom" JSONB,
    "changeTo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_insights_projectId_impactScore_idx" ON "project_insights"("projectId", "impactScore" DESC);

-- CreateIndex
CREATE INDEX "project_insights_projectId_moduleKey_windowKind_state_idx" ON "project_insights"("projectId", "moduleKey", "windowKind", "state");

-- CreateIndex
CREATE UNIQUE INDEX "project_insights_projectId_moduleKey_dimensionKey_windowKin_key" ON "project_insights"("projectId", "moduleKey", "dimensionKey", "windowKind", "state");

-- CreateIndex
CREATE INDEX "insight_events_insightId_createdAt_idx" ON "insight_events"("insightId", "createdAt");

-- AddForeignKey
ALTER TABLE "insight_events" ADD CONSTRAINT "insight_events_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "project_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
