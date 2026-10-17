-- The grid each layout was saved on; existing rows are on the 12-column grid
-- until code migration 25 doubles them.
ALTER TABLE "report_layouts" ADD COLUMN "gridColumns" INTEGER NOT NULL DEFAULT 12;

-- Defaults in the 24-column grid units.
ALTER TABLE "report_layouts" ALTER COLUMN "w" SET DEFAULT 8,
ALTER COLUMN "h" SET DEFAULT 6,
ALTER COLUMN "minW" SET DEFAULT 4,
ALTER COLUMN "minH" SET DEFAULT 4;
