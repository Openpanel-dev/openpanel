-- One RevenueCat webhook per project.
CREATE TABLE "revenuecat_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastEventAt" TIMESTAMP(3),
    "lastEventType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenuecat_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revenuecat_webhooks_projectId_key" ON "revenuecat_webhooks"("projectId");

CREATE UNIQUE INDEX "revenuecat_webhooks_tokenHash_key" ON "revenuecat_webhooks"("tokenHash");

ALTER TABLE "revenuecat_webhooks" ADD CONSTRAINT "revenuecat_webhooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
