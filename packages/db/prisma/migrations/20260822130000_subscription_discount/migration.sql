-- Compact summary of the discount applied to the subscription (synced from
-- Polar's embedded discount object) so the dashboard can show that a discount
-- is active — including the cancel-flow save offer.
ALTER TABLE "organizations"
  ADD COLUMN "subscriptionDiscount" JSONB;
