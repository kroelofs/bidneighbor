import type { Env } from "../types";
import { uuid, now } from "./http";

/**
 * Private conversations. A thread is generic — it hangs off a *subject* (a task now,
 * a resource in a later sprint) and has exactly two participants: the subject `owner`
 * and the `initiator` who reached out. Authz everywhere reduces to `isParticipant`, so
 * a task poster only ever sees a thread per bidder and one bidder can never see another
 * bidder's thread.
 */

/** Subject types a conversation may hang off. Add 'resource' when that sprint lands. */
export const SUBJECT_TYPES = ["task"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export function isSubjectType(v: unknown): v is SubjectType {
  return typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);
}

export interface ConversationRow {
  id: string;
  subject_type: string;
  subject_id: string;
  owner_id: string;
  initiator_id: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Pure: is this user one of the two participants? (The only authz gate for a thread.) */
export function isParticipant(conv: Pick<ConversationRow, "owner_id" | "initiator_id">, userId: string): boolean {
  return userId === conv.owner_id || userId === conv.initiator_id;
}

/** Pure: given a sender, who is the *other* participant (the notification recipient)? */
export function recipientOf(conv: Pick<ConversationRow, "owner_id" | "initiator_id">, senderId: string): string {
  return senderId === conv.owner_id ? conv.initiator_id : conv.owner_id;
}

/**
 * Resolve who owns a subject. Single choke point so routes and the queue agree on
 * ownership. Returns null if the subject is missing or not visible.
 */
export async function resolveSubjectOwner(
  env: Env,
  subjectType: SubjectType,
  subjectId: string,
): Promise<string | null> {
  if (subjectType === "task") {
    const row = await env.DB.prepare(
      "SELECT customer_id AS owner_id FROM tasks WHERE id = ? AND status != 'hidden'",
    ).bind(subjectId).first<{ owner_id: string }>();
    return row?.owner_id ?? null;
  }
  // 'resource' is added when the Resources sprint ships the table.
  return null;
}

/** Idempotent — a second open of the same (subject, initiator) returns the same row. */
export async function findOrCreateConversation(
  env: Env,
  args: { subjectType: SubjectType; subjectId: string; ownerId: string; initiatorId: string },
): Promise<ConversationRow> {
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO conversations
       (id, subject_type, subject_id, owner_id, initiator_id, status, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', NULL, ?, ?)
     ON CONFLICT(subject_type, subject_id, initiator_id) DO NOTHING`,
  ).bind(uuid(), args.subjectType, args.subjectId, args.ownerId, args.initiatorId, ts, ts).run();

  const conv = await env.DB.prepare(
    "SELECT * FROM conversations WHERE subject_type = ? AND subject_id = ? AND initiator_id = ?",
  ).bind(args.subjectType, args.subjectId, args.initiatorId).first<ConversationRow>();
  return conv as ConversationRow;
}

export async function getConversation(env: Env, id: string): Promise<ConversationRow | null> {
  return env.DB.prepare("SELECT * FROM conversations WHERE id = ?").bind(id).first<ConversationRow>();
}

/** Upsert the caller's read watermark to now. */
export async function markConversationRead(env: Env, conversationId: string, userId: string): Promise<void> {
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
  ).bind(conversationId, userId, ts).run();
}
