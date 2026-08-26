-- Set once by the worker when a project's first event arrives. Powers the
-- activation checklist and onboarding verification.
ALTER TABLE "projects"
  ADD COLUMN "firstEventAt" TIMESTAMP(3);
