-- BidNeighbor.com — private conversations (poster <-> one counterpart)
-- A thread is generic: it hangs off a subject (a task now, a resource later) so the
-- same engine serves task messaging and, in a later sprint, resource rentals.
-- Only the two participants (owner_id, initiator_id) can ever read or post.

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  subject_type    TEXT NOT NULL,                  -- 'task' | 'resource'
  subject_id      TEXT NOT NULL,
  owner_id        TEXT NOT NULL,                  -- task.customer_id (later resource.owner_id)
  initiator_id    TEXT NOT NULL,                  -- the provider / the renter
  status          TEXT NOT NULL DEFAULT 'active', -- active | hidden (admin-moderated)
  last_message_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
-- Exactly one thread per (subject, initiator) — opening an existing thread is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_subject_initiator
  ON conversations(subject_type, subject_id, initiator_id);
-- Inbox reads for either role, index-served (D1 bills rows SCANNED).
CREATE INDEX IF NOT EXISTS idx_conversations_owner     ON conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_initiator ON conversations(initiator_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id       TEXT NOT NULL,
  body            TEXT NOT NULL,                  -- sanitizeText'd
  created_at      TEXT NOT NULL
);
-- Thread read stays a SEARCH, not a SCAN.
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Per-participant read state, for an accurate unread badge on both sides.
CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  last_read_at    TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- New-message email opt-out, matching the existing notify_* prefs on users.
ALTER TABLE users ADD COLUMN notify_messages INTEGER NOT NULL DEFAULT 1;
