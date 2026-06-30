-- BidNeighbor.com — initial schema
-- All ids are text (UUID). Timestamps are ISO-8601 UTC text. Money is integer cents.

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  name             TEXT,
  phone            TEXT,
  role             TEXT NOT NULL DEFAULT 'customer',     -- customer | provider | admin
  admin_level      TEXT,                                  -- superadmin | admin | platform_manager | NULL
  auth_provider    TEXT,                                  -- magic_link | google
  town             TEXT,
  county           TEXT,
  provider_bio     TEXT,
  theme_preference TEXT NOT NULL DEFAULT 'light',         -- light | dark
  status           TEXT NOT NULL DEFAULT 'active',        -- active | suspended
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_county ON users(county);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_categories (
  user_id     TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_user_categories_cat ON user_categories(category_id);

CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  customer_id          TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL,
  category_id          TEXT NOT NULL,
  town                 TEXT,
  county               TEXT,
  location_note        TEXT,
  budget_cents         INTEGER,
  timeframe            TEXT,
  status               TEXT NOT NULL DEFAULT 'open',      -- open | assigned | completed | cancelled | hidden
  selected_response_id TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
-- Board listing + notification matching hot path.
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(status, county, category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);

CREATE TABLE IF NOT EXISTS task_files (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  filename     TEXT,
  content_type TEXT,
  size_bytes   INTEGER,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);

CREATE TABLE IF NOT EXISTS responses (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  message     TEXT NOT NULL,
  quote_cents INTEGER,
  status      TEXT NOT NULL DEFAULT 'active',             -- active | withdrawn | hidden
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_task ON responses(task_id);
CREATE INDEX IF NOT EXISTS idx_responses_provider ON responses(provider_id);
-- One ACTIVE response per provider per task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_responses_active
  ON responses(task_id, provider_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',            -- queued | sent | failed
  created_at   TEXT NOT NULL,
  sent_at      TEXT
);

CREATE TABLE IF NOT EXISTS admin_flags (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,                              -- task | response | user
  entity_id   TEXT NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'open',               -- open | resolved
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  actor_user_id   TEXT,                                   -- the (possibly impersonated) acting user
  impersonator_id TEXT,                                   -- admin id when done under impersonation, else NULL
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  meta_json       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
