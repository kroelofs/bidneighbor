import type { Env, AuthContext } from "../types";
import { json, badRequest, forbidden, unauthorized, notFound, uuid, now } from "../lib/http";
import { sanitizeText, toCents } from "../lib/text";
import { isSuspended } from "../lib/guards";

interface ResponseRow {
  id: string;
  task_id: string;
  provider_id: string;
  message: string;
  quote_cents: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** POST /api/tasks/:id/responses — a provider expresses interest / quotes. */
export async function createResponse(req: Request, env: Env, auth: AuthContext | null, taskId: string): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();
  const task = await env.DB.prepare("SELECT id, status, customer_id FROM tasks WHERE id = ?")
    .bind(taskId).first<{ id: string; status: string; customer_id: string }>();
  if (!task || task.status === "hidden") return notFound();
  if (task.status !== "open") return badRequest("This task is no longer open");
  if (task.customer_id === auth.user.id) return badRequest("You can't respond to your own task");

  const body = (await req.json().catch(() => ({}))) as { message?: string; quote?: unknown };
  const message = sanitizeText(body.message, 2000);
  if (!message) return badRequest("Message required");

  // One active response per (task, provider) — enforced by partial unique index too.
  const existing = await env.DB.prepare(
    "SELECT id FROM responses WHERE task_id = ? AND provider_id = ? AND status = 'active'",
  ).bind(taskId, auth.user.id).first<{ id: string }>();
  if (existing) return badRequest("You already have an active response on this task. Edit it instead.");

  const id = uuid();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO responses (id, task_id, provider_id, message, quote_cents, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, taskId, auth.user.id, message, toCents(body.quote), ts, ts).run();
  await env.NOTIFICATION_QUEUE.send({ type: "response_received", task_id: taskId, response_id: id });
  return json({ id });
}

/** PATCH /api/responses/:id — author provider updates or withdraws. */
export async function updateResponse(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const resp = await env.DB.prepare("SELECT * FROM responses WHERE id = ?").bind(id).first<ResponseRow>();
  if (!resp) return notFound();
  if (resp.provider_id !== auth.user.id) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { message?: string; quote?: unknown; status?: string };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.message === "string") { sets.push("message = ?"); binds.push(sanitizeText(body.message, 2000)); }
  if (body.quote !== undefined) { sets.push("quote_cents = ?"); binds.push(toCents(body.quote)); }
  if (body.status === "withdrawn" || body.status === "active") { sets.push("status = ?"); binds.push(body.status); }
  if (!sets.length) return badRequest("Nothing to update");
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(id);
  await env.DB.prepare(`UPDATE responses SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return json({ ok: true });
}
