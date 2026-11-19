-- First-touch marketing attribution captured at sign-up (referrer, landing page, UTM).
ALTER TABLE "organizations" ADD COLUMN "attribution" JSONB;
