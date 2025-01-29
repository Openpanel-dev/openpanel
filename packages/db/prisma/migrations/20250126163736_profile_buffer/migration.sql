-- CreateTable
CREATE TABLE "profile_buffer" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_buffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_buffer_projectId_profileId_idx" ON "profile_buffer"("projectId", "profileId");

-- CreateIndex
CREATE INDEX "profile_buffer_projectId_processedAt_idx" ON "profile_buffer"("projectId", "processedAt");

-- CreateIndex
CREATE INDEX "profile_buffer_checksum_idx" ON "profile_buffer"("checksum");
