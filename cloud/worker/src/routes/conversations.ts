import type { Env, AuthContext } from "../types";
import { json, error, badRequest, forbidden, unauthorized, notFound, uuid, now } from "../lib/http";
import { sanitizeText } from "../lib/text";
import { isSuspended } from "../lib/guards";
import { rateLimit } from "../lib/ratelimit";
import {
  isSubjectType,
  resolveSubjectOwner,
  findOrCreateConversation,
  getConversation,
  markConversationRead,
  isParticipant,
  type SubjectType,
} from "../lib/conversations";

/** GET /api/conversations — my inbox (either role), newest activity first, with unread counts. */
export async function listConversations(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const uid = auth.user.id;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.subject_type, c.subject_id, c.owner_id, c.initiator_id,
            c.last_message_at, c.created_at,
            ou.name AS owner_name, iu.name AS initiator_name,
            (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id AND m.sender_id != ?1
                 AND m.created_at > COALESCE(
                   (SELECT last_read_at FROM conversation_reads r
                      WHERE r.conversation_id = c.id AND r.user_id = ?1), '')
            ) AS unread
       FROM conversations c
       JOIN users ou ON ou.id = c.owner_id
       JOIN users iu ON iu.id = c.initiator_id
      WHERE (c.owner_id = ?1 OR c.initiator_id = ?1) AND c.status = 'active'
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
  ).bind(uid).all<Record<string, unknown>>();

  const rows = results ?? [];
  const labels = await subjectLabels(env, rows);

  const conversations = rows.map((c) => {
    const isOwner = c.owner_id === uid;
    return {
      id: c.id,
      subject_type: c.subject_type,
      subject_id: c.subject_id,
      subject_label: labels.get(`${c.subject_type}:${c.subject_id}`) ?? null,
      // Only ever expose the *other* party, name only (never email/phone).
      other_party: { name: (isOwner ? c.initiator_name : c.owner_name) ?? null },
      last_message_at: c.last_message_at,
      unread: Number(c.unread ?? 0),
    };
  });
  return json({ conversations });
}

/** Batch-resolve subject titles so the inbox shows "Mow my yard" not a raw id. */
async function subjectLabels(env: Env, rows: Record<string, unknown>[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const taskIds = [...new Set(rows.filter((r) => r.subject_type === "task").map((r) => r.subject_id as string))];
  if (taskIds.length) {
    const placeholders = taskIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT id, title FROM tasks WHERE id IN (${placeholders})`,
    ).bind(...taskIds).all<{ id: string; title: string }>();
    for (const t of results ?? []) out.set(`task:${t.id}`, t.title);
  }
  return out;
}

/**
 * POST /api/conversations — find-or-create a thread. Body: { subject_type, subject_id,
 * with_user_id? }. If the caller owns the subject they must name the counterpart
 * (with_user_id); otherwise the caller *is* the initiator. For tasks, the non-owner
 * party must have responded — keeps the poster's inbox to real bidders.
 */
export async function startConversation(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    subject_type?: string;
    subject_id?: string;
    with_user_id?: string;
  };
  if (!isSubjectType(body.subject_type) || !body.subject_id) {
    return badRequest("subject_type and subject_id required");
  }
  const subjectType: SubjectType = body.subject_type;
  const subjectId = body.subject_id;

  const ownerId = await resolveSubjectOwner(env, subjectType, subjectId);
  if (!ownerId) return notFound();

  let initiatorId: string;
  if (auth.user.id === ownerId) {
    // Owner reaching out to a specific counterpart.
    if (!body.with_user_id) return badRequest("with_user_id required to message a specific person");
    if (body.with_user_id === ownerId) return badRequest("You can't message yourself");
    initiatorId = body.with_user_id;
    if (!(await hasResponded(env, subjectType, subjectId, initiatorId))) {
      return badRequest("That person hasn't responded to this task");
    }
  } else {
    // A non-owner (a provider) reaching out to the poster.
    initiatorId = auth.user.id;
    if (!(await hasResponded(env, subjectType, subjectId, initiatorId))) {
      return badRequest("Respond to the task before messaging the poster");
    }
  }

  const conv = await findOrCreateConversation(env, { subjectType, subjectId, ownerId, initiatorId });
  return json({ id: conv.id });
}

/** For tasks, a thread requires a prior response. Other subject types have no gate (yet). */
async function hasResponded(env: Env, subjectType: SubjectType, subjectId: string, providerId: string): Promise<boolean> {
  if (subjectType !== "task") return true;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM responses WHERE task_id = ? AND provider_id = ? LIMIT 1",
  ).bind(subjectId, providerId).first<{ ok: number }>();
  return !!row;
}

/** GET /api/conversations/:id/messages — participants only; marks the thread read. */
export async function listMessages(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const conv = await getConversation(env, id);
  if (!conv || conv.status !== "active") return notFound();
  if (!isParticipant(conv, auth.user.id)) return forbidden();

  const { results } = await env.DB.prepare(
    "SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
  ).bind(id).all<{ id: string; sender_id: string; body: string; created_at: string }>();

  await markConversationRead(env, id, auth.user.id);

  return json({
    conversation: {
      id: conv.id,
      subject_type: conv.subject_type,
      subject_id: conv.subject_id,
      owner_id: conv.owner_id,
      initiator_id: conv.initiator_id,
    },
    messages: (results ?? []).map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      mine: m.sender_id === auth.user.id,
      body: m.body,
      created_at: m.created_at,
    })),
  });
}

/** POST /api/conversations/:id/messages — participants only. */
export async function postMessage(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();
  const conv = await getConversation(env, id);
  if (!conv || conv.status !== "active") return notFound();
  if (!isParticipant(conv, auth.user.id)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = sanitizeText(body.body, 2000);
  if (!text) return badRequest("Message required");

  const rl = await rateLimit(env, `msg:${auth.user.id}`, 30, 60);
  if (!rl.ok) return error(429, "You're sending messages too fast — try again in a moment");

  const msgId = uuid();
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(msgId, id, auth.user.id, text, ts),
    env.DB.prepare(
      "UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?",
    ).bind(ts, ts, id),
    // The sender has, by definition, read up to their own message.
    env.DB.prepare(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    ).bind(id, auth.user.id, ts),
  ]);
  await env.NOTIFICATION_QUEUE.send({ type: "message_received", message_id: msgId });
  return json({ id: msgId });
}

/** POST /api/conversations/:id/read — participants only; clears the unread badge. */
export async function markRead(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const conv = await getConversation(env, id);
  if (!conv || conv.status !== "active") return notFound();
  if (!isParticipant(conv, auth.user.id)) return forbidden();
  await markConversationRead(env, id, auth.user.id);
  return json({ ok: true });
}
