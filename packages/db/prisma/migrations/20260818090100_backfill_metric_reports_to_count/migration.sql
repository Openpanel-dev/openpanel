-- Every existing metric-type report stores 'sum' because the column is
-- NOT NULL DEFAULT 'sum' and nothing ever wrote anything else — the value was
-- read by nothing, since the SQL builders ignore `metric` and the Metric card
-- hardcoded 'count'. Now that the card honours the stored value, leaving them
-- at 'sum' would flip every existing tile from unique-users to summed events.
--
-- Lossless: for chartType = 'metric' the stored value carried no user intent.
UPDATE "reports" SET "metric" = 'count' WHERE "chartType" = 'metric';
