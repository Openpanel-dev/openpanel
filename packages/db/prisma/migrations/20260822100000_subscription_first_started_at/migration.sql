-- Stable subscription-creation timestamp for tenure. subscriptionStartsAt is
-- overwritten with the current period start on every renewal, so it cannot
-- answer "how long has this customer been subscribed" — this column can.
-- Backfilled from Polar via packages/payments/scripts/sync-subscriptions.ts.
ALTER TABLE "organizations"
  ADD COLUMN "subscriptionFirstStartedAt" TIMESTAMP(3);
