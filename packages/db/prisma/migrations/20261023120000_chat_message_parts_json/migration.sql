-- jsonb reorders object keys and normalizes numbers, so a replayed turn no
-- longer matched what the model saw and Anthropic rejected its thinking
-- signatures. json stores the parts verbatim.
ALTER TABLE "chat_messages" ALTER COLUMN "parts" TYPE JSON USING "parts"::text::json;
