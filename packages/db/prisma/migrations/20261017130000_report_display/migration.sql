-- How a dashboard tile shows the report: { "view": "chart" | "table" }.
ALTER TABLE "reports" ADD COLUMN "display" JSONB;
