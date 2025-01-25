-- CreateTable
CREATE TABLE "event_buffer" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileId" TEXT,
    "sessionId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_buffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_buffer_eventId_key" ON "event_buffer"("eventId");

-- CreateIndex
CREATE INDEX "event_buffer_projectId_processedAt_createdAt_idx" ON "event_buffer"("projectId", "processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "event_buffer_projectId_profileId_sessionId_createdAt_idx" ON "event_buffer"("projectId", "profileId", "sessionId", "createdAt");
