-- Wind-down: the lifecycle between an expired trial and deleting the data.
--
-- "windDownStartedAt" is the schedule anchor, stamped when an organization
-- enters the sequence. It exists precisely because "subscriptionEndsAt" cannot
-- serve that role: every organization already in trial_expired has an expiry
-- weeks or months in the past, so a schedule measured from it would place them
-- all past the final step immediately and delete them without a single warning
-- email. Anchoring on entry puts the whole backlog at day 0 instead.
--
-- "windDownStep" is the last step whose email was sent. It doubles as the
-- ingestion gate: 'blocked' and 'final_warning' cause the API to reject events
-- (see apps/api/src/hooks/subscription.hook.ts). Both columns are NULL for
-- every existing row, so this migration blocks nothing on its own; blocking
-- only starts once the wind-down cron has walked an org to day 21.
ALTER TABLE "organizations" ADD COLUMN "windDownStartedAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "windDownStep" TEXT;

CREATE INDEX "organizations_windDownStartedAt_idx" ON "organizations"("windDownStartedAt");
