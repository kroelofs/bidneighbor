-- Neighborhood Resources — residents list equipment + a daily rate for neighbors to rent.
-- status: shown-immediately model (a fast keyword gate blocks the worst on submit);
-- moderation_state tracks the async AI verdict separately so a later user report can
-- hide a listing without losing the AI history.
CREATE TABLE IF NOT EXISTS resources (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  category_id      TEXT,                            -- optional; reuse categories or NULL
  daily_rate_cents INTEGER,                          -- integer cents
  deposit_cents    INTEGER,
  town             TEXT,
  county           TEXT,
  status           TEXT NOT NULL DEFAULT 'active',   -- active | flagged | hidden | removed
  moderation_state TEXT NOT NULL DEFAULT 'pending',  -- pending | clear | flagged (AI verdict)
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
-- Browse hot path: active listings by area + category. Keep it a SEARCH, not a SCAN.
CREATE INDEX IF NOT EXISTS idx_resources_board ON resources(status, county, category_id);
CREATE INDEX IF NOT EXISTS idx_resources_owner ON resources(owner_id);

CREATE TABLE IF NOT EXISTS resource_files (
  id           TEXT PRIMARY KEY,
  resource_id  TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  filename     TEXT,
  content_type TEXT,
  size_bytes   INTEGER,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resource_files_resource ON resource_files(resource_id);
