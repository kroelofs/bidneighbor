-- Grant superadmin access to the platform owners.
-- Idempotent: pre-create cgsoodsma if they have not logged in yet (findOrCreateByEmail
-- matches on email, so a later Google/magic-link login keeps this admin_level), then
-- force role + admin_level for both owners regardless of prior row state.

INSERT OR IGNORE INTO users (id, email, name, role, admin_level, auth_provider, county, theme_preference, status, created_at, updated_at)
VALUES ('user_cgsoodsma', 'cgsoodsma@gmail.com', NULL, 'admin', 'superadmin', 'google', 'Sioux County', 'light', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

UPDATE users
SET role = 'admin', admin_level = 'superadmin', updated_at = '2026-01-01T00:00:00Z'
WHERE email IN ('kyle@steadycalls.com', 'cgsoodsma@gmail.com')
  AND (role != 'admin' OR admin_level IS NOT 'superadmin');
