-- Image attachments on private messages. conversation_id is denormalized so the
-- serve endpoint can authorize a viewer (participant check) without a join.
CREATE TABLE IF NOT EXISTS message_files (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  size_bytes      INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_files_message ON message_files(message_id);
