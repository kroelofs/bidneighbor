-- Seed categories + the first superadmin. Idempotent (INSERT OR IGNORE on stable ids).
-- Run: npm run seed:remote  (or seed:local)

INSERT OR IGNORE INTO categories (id, name, slug, is_active, created_at) VALUES
  ('cat_lawn_care',          'Lawn Care',          'lawn-care',          1, '2026-01-01T00:00:00Z'),
  ('cat_snow_removal',       'Snow Removal',       'snow-removal',       1, '2026-01-01T00:00:00Z'),
  ('cat_junk_hauling',       'Junk Hauling',       'junk-hauling',       1, '2026-01-01T00:00:00Z'),
  ('cat_handyman',           'Handyman',           'handyman',           1, '2026-01-01T00:00:00Z'),
  ('cat_painting',           'Painting',           'painting',           1, '2026-01-01T00:00:00Z'),
  ('cat_drywall',            'Drywall',            'drywall',            1, '2026-01-01T00:00:00Z'),
  ('cat_cleaning',           'Cleaning',           'cleaning',           1, '2026-01-01T00:00:00Z'),
  ('cat_small_engine',       'Small Engine Repair','small-engine-repair',1, '2026-01-01T00:00:00Z'),
  ('cat_auto_help',          'Auto Help',          'auto-help',          1, '2026-01-01T00:00:00Z'),
  ('cat_moving_help',        'Moving Help',        'moving-help',        1, '2026-01-01T00:00:00Z'),
  ('cat_landscaping',        'Landscaping',        'landscaping',        1, '2026-01-01T00:00:00Z'),
  ('cat_tree_work',          'Tree Work',          'tree-work',          1, '2026-01-01T00:00:00Z'),
  ('cat_concrete',           'Concrete',           'concrete',           1, '2026-01-01T00:00:00Z'),
  ('cat_farm_help',          'Farm Help',          'farm-help',          1, '2026-01-01T00:00:00Z'),
  ('cat_misc',               'Miscellaneous',      'miscellaneous',      1, '2026-01-01T00:00:00Z');

-- First superadmin. Change the email to the real admin before running in prod.
INSERT OR IGNORE INTO users (id, email, name, role, admin_level, auth_provider, county, theme_preference, status, created_at, updated_at)
VALUES ('user_superadmin', 'kyle@steadycalls.com', 'Kyle', 'admin', 'superadmin', 'magic_link', 'Sioux County', 'light', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
