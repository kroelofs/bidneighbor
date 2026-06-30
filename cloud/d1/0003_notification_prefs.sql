-- Email notification preferences (per-user toggles).
-- notify_new_tasks: provider receives "new matching task" emails.
-- notify_responses: customer receives "new response" emails AND provider receives "you were selected" emails.
ALTER TABLE users ADD COLUMN notify_new_tasks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_responses INTEGER NOT NULL DEFAULT 1;
