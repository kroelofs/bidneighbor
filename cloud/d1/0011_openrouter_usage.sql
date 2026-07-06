-- Per-call OpenRouter spend, so /admin/integrations can show a daily cost tracker.
-- One row per AI call (moderation + photo-draft). cost_usd comes from OpenRouter's
-- response `usage.cost` (we request usage:{include:true}); 0 when the API omits it.
CREATE TABLE IF NOT EXISTS openrouter_usage (
  id         TEXT PRIMARY KEY,
  model      TEXT NOT NULL,
  kind       TEXT NOT NULL,                 -- moderation | draft
  cost_usd   REAL NOT NULL DEFAULT 0,       -- USD, from OpenRouter usage.cost
  created_at TEXT NOT NULL                  -- ISO-8601 UTC
);

-- The cost report groups by day over a trailing window — index the range column.
CREATE INDEX IF NOT EXISTS idx_openrouter_usage_created ON openrouter_usage(created_at);
