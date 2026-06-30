-- Profile picture URL (populated from Google sign-in; null for magic-link users,
-- who get an initials avatar in the UI).
ALTER TABLE users ADD COLUMN avatar_url TEXT;
