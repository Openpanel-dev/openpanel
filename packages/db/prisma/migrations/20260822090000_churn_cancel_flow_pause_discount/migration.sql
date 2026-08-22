-- Cancel-flow churn work: capture the customer's cancellation reason/comment,
-- guard the one-time save-offer discount, and mirror Polar's pause state
-- (pause-at-period-end keeps status `active` until the period ends, then the
-- subscription flips to `paused`; `resumesAt` schedules the automatic resume).
ALTER TABLE "organizations"
  ADD COLUMN "subscriptionCancelReason" TEXT,
  ADD COLUMN "subscriptionCancelComment" TEXT,
  ADD COLUMN "subscriptionSaveDiscountAppliedAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionPauseAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subscriptionResumesAt" TIMESTAMP(3);
