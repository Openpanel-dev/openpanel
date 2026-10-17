-- A saved union of events (each optionally narrowed by filters) that reports reference by id.
CREATE TABLE "custom_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_events_projectId_name_key" ON "custom_events"("projectId", "name");

ALTER TABLE "custom_events" ADD CONSTRAINT "custom_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
