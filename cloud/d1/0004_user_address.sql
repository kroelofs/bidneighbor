-- Structured address for providers (free-text town/county remain for the task board).
-- The public provider directory shows only city, state, zip — never street_address.
ALTER TABLE users ADD COLUMN street_address TEXT;
ALTER TABLE users ADD COLUMN city  TEXT;
ALTER TABLE users ADD COLUMN state TEXT;
ALTER TABLE users ADD COLUMN zip   TEXT;

-- Keep the public directory query a SEARCH, not a SCAN (D1 bills rows scanned).
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(role, status);
