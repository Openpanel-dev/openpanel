-- AI observability privacy switch: whether prompts and completions are stored.
ALTER TABLE "projects" ADD COLUMN "aiStoreContent" BOOLEAN NOT NULL DEFAULT true;
