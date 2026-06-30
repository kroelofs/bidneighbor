-- Track which R2 storage class each task file currently sits in, so the daily
-- retention cron only transitions files once. created_at index keeps the
-- cron's age queries a SEARCH (D1 bills rows scanned).
ALTER TABLE task_files ADD COLUMN storage_class TEXT NOT NULL DEFAULT 'Standard'; -- Standard | InfrequentAccess
CREATE INDEX IF NOT EXISTS idx_task_files_created ON task_files(created_at);
