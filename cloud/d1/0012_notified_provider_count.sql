-- How many matching providers were notified when a task was posted. Set by the
-- task_posted queue handler after fan-out; surfaced to the poster so the first-post
-- wait ("did anything happen? is anyone out there?") has a real answer.
ALTER TABLE tasks ADD COLUMN notified_provider_count INTEGER NOT NULL DEFAULT 0;
