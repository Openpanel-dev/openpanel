-- AlterTable
ALTER TABLE "public"."project_insights" ADD COLUMN     "aiCategory" TEXT,
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "emailWorthy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enrichVersion" INTEGER,
ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "referenceWorthy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "relevanceScore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "project_insights_projectId_state_relevanceScore_idx" ON "public"."project_insights"("projectId", "state", "relevanceScore" DESC);
