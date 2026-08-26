-- Usage-alert dedupe markers (cleared on billing-cycle reset / limit raise)
-- and data-health notice markers for the dataHealth cron.
ALTER TABLE "organizations"
  ADD COLUMN "usageWarningSentAt" TIMESTAMP(3),
  ADD COLUMN "usageExceededSentAt" TIMESTAMP(3);

ALTER TABLE "projects"
  ADD COLUMN "noDataNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "dataStoppedNotifiedAt" TIMESTAMP(3);
