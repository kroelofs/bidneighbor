-- Add service categories: tutoring, music lessons, welding, drywall repair, translation.
-- Idempotent (INSERT OR IGNORE on stable ids), mirrors the ids/format used in seed.sql.
INSERT OR IGNORE INTO categories (id, name, slug, is_active, created_at) VALUES
  ('cat_tutoring',       'Tutoring',       'tutoring',       1, '2026-07-06T00:00:00Z'),
  ('cat_music_lessons',  'Music Lessons',  'music-lessons',  1, '2026-07-06T00:00:00Z'),
  ('cat_welding',        'Welding',        'welding',        1, '2026-07-06T00:00:00Z'),
  ('cat_drywall_repair', 'Drywall Repair', 'drywall-repair', 1, '2026-07-06T00:00:00Z'),
  ('cat_translation',    'Translation',    'translation',    1, '2026-07-06T00:00:00Z');
