-- Geocoded coordinates for a user's address, captured from Google Places autocomplete.
-- Nullable: manual (non-autocomplete) address entry leaves these NULL.
-- Enables future provider <-> task distance / radius matching.
ALTER TABLE users ADD COLUMN latitude  REAL;
ALTER TABLE users ADD COLUMN longitude REAL;
