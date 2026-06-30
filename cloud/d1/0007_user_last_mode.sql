-- Remembers which UI lens ("mode") a user last used so it follows them across devices.
-- 'neighbor' = the get-help view (post tasks); 'provider' = the do-jobs view.
-- NULL means never chosen → the client defaults to 'neighbor'.
ALTER TABLE users ADD COLUMN last_mode TEXT;
