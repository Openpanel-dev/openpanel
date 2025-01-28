-- CreateTable
CREATE TABLE "bot_event_buffer" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "bot_event_buffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_event_buffer_processedAt_idx" ON "bot_event_buffer"("processedAt");

-- CreateIndex
CREATE INDEX "bot_event_buffer_projectId_eventId_idx" ON "bot_event_buffer"("projectId", "eventId");
