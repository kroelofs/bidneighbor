import type { Env, AuthContext } from "../types";
import { json, badRequest, forbidden, unauthorized, notFound, uuid, now } from "../lib/http";
import { sanitizeText, toCents } from "../lib/text";
import { rateLimit } from "../lib/ratelimit";
import { verifyTurnstile } from "../lib/turnstile";
import { isSuspended } from "../lib/guards";
import { publicUser } from "../lib/serialize";
import { taskSlug, taskIdFilter } from "../lib/taskref";

interface TaskRow {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  category_id: string;
  town: string | null;
  county: string | null;
  location_note: string | null;
  budget_cents: number | null;
  timeframe: string | null;
  status: string;
  selected_response_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Public-safe task shape — no customer contact info.
 *  `share_url` is always built from APP_BASE_URL so links shared from any host
 *  (including admin.bidneighbor.com) point at the public app host. */
function publicTask(t: TaskRow & { category_name?: string }, appBase: string) {
  const slug = taskSlug(t);
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category_id: t.category_id,
    category_name: t.category_name ?? null,
    town: t.town,
    county: t.county,
    location_note: t.location_note,
    budget_cents: t.budget_cents,
    timeframe: t.timeframe,
    status: t.status,
    selected_response_id: t.selected_response_id,
    created_at: t.created_at,
    slug,
    share_url: `${appBase}/tasks/${slug}`,
  };
}

/** GET /api/tasks — public board, open tasks only, with filters. */
export async function listTasks(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const where: string[] = ["t.status = 'open'"];
  const binds: unknown[] = [];
  const category = url.searchParams.get("category");
  const town = url.searchParams.get("town");
  const county = url.searchParams.get("county");
  const timeframe = url.searchParams.get("timeframe");
  if (category) { where.push("t.category_id = ?"); binds.push(category); }
  if (town) { where.push("t.town = ?"); binds.push(town); }
  if (county) { where.push("t.county = ?"); binds.push(county); }
  if (timeframe) { where.push("t.timeframe = ?"); binds.push(timeframe); }
  const { results } = await env.DB.prepare(
    `SELECT t.*, c.name AS category_name FROM tasks t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${where.join(" AND ")} ORDER BY t.created_at DESC LIMIT 100`,
  ).bind(...binds).all<TaskRow & { category_name: string }>();
  return json({ tasks: (results ?? []).map((t) => publicTask(t, env.APP_BASE_URL)) });
}

/** POST /api/tasks — customer creates a task. */
export async function createTask(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();
  const limit = await rateLimit(env, `taskpost:user:${auth.user.id}`, 10, 86400);
  if (!limit.ok) return badRequest("Daily task limit reached");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await verifyTurnstile(env, body.turnstileToken, req))) return badRequest("Spam check failed");

  const title = sanitizeText(body.title, 120);
  const description = sanitizeText(body.description, 5000);
  const category_id = typeof body.category_id === "string" ? body.category_id : "";
  if (!title || !description || !category_id) return badRequest("Title, description, and category are required");

  const id = uuid();
  const ts = now();
  const town = sanitizeText(body.town, 80) || auth.user.town;
  const county = sanitizeText(body.county, 80) || auth.user.county;
  await env.DB.prepare(
    `INSERT INTO tasks (id, customer_id, title, description, category_id, town, county, location_note, budget_cents, timeframe, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  )
    .bind(
      id, auth.user.id, title, description, category_id,
      town, county,
      sanitizeText(body.location_note, 200),
      toCents(body.budget),
      sanitizeText(body.timeframe, 60),
      ts, ts,
    )
    .run();
  await env.NOTIFICATION_QUEUE.send({ type: "task_posted", task_id: id });
  const slug = taskSlug({ id, title, town, county });
  return json({ id, slug, share_url: `${env.APP_BASE_URL}/tasks/${slug}` });
}

/** GET /api/tasks/:ref — public detail (contact info hidden).
 *  `ref` is a slug ("<title>-<locality>-<id8>") or a full UUID (legacy links).
 *  When the requester is signed in we also return `is_owner` so the client can show
 *  owner controls vs the respond form without guessing from response counts. */
export async function getTask(_req: Request, env: Env, auth: AuthContext | null, ref: string): Promise<Response> {
  const filter = taskIdFilter(ref, "t.id");
  if (!filter) return notFound();
  const task = await env.DB.prepare(
    `SELECT t.*, c.name AS category_name FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${filter.clause} ORDER BY t.id LIMIT 1`,
  ).bind(...filter.binds).first<TaskRow & { category_name: string }>();
  if (!task || task.status === "hidden" || task.status === "deleted") return notFound();
  const files = await env.DB.prepare(
    "SELECT id, filename, content_type FROM task_files WHERE task_id = ? ORDER BY created_at",
  ).bind(task.id).all();
  const is_owner = !!auth && auth.user.id === task.customer_id;
  return json({ task: publicTask(task, env.APP_BASE_URL), files: files.results ?? [], is_owner });
}

/** GET /api/my-tasks — the signed-in user's own posted tasks (any status). */
export async function myTasks(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const { results } = await env.DB.prepare(
    `SELECT t.*, c.name AS category_name FROM tasks t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.customer_id = ? AND t.status NOT IN ('hidden', 'deleted') ORDER BY t.created_at DESC LIMIT 100`,
  ).bind(auth.user.id).all<TaskRow & { category_name: string }>();
  return json({ tasks: (results ?? []).map((t) => publicTask(t, env.APP_BASE_URL)) });
}

/** PATCH /api/tasks/:id — owner only (edit / close / cancel). */
export async function updateTask(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  if (!task) return notFound();
  if (task.customer_id !== auth.user.id) return forbidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.title === "string") { sets.push("title = ?"); binds.push(sanitizeText(body.title, 120)); }
  if (typeof body.description === "string") { sets.push("description = ?"); binds.push(sanitizeText(body.description, 5000)); }
  if (typeof body.timeframe === "string") { sets.push("timeframe = ?"); binds.push(sanitizeText(body.timeframe, 60)); }
  if (body.budget !== undefined) { sets.push("budget_cents = ?"); binds.push(toCents(body.budget)); }
  if (typeof body.status === "string" && ["open", "assigned", "completed", "cancelled"].includes(body.status)) {
    sets.push("status = ?"); binds.push(body.status);
  }
  if (!sets.length) return badRequest("Nothing to update");
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(id);
  await env.DB.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return json({ ok: true });
}

/** DELETE /api/tasks/:id — owner removes their own task (soft delete).
 *  Sets status = 'deleted' so it drops out of `my-tasks`, the public board, and
 *  detail views, while preserving the row (and any responses) for moderation/audit. */
export async function deleteTask(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const task = await env.DB.prepare("SELECT customer_id FROM tasks WHERE id = ?").bind(id).first<{ customer_id: string }>();
  if (!task) return notFound();
  if (task.customer_id !== auth.user.id) return forbidden();
  await env.DB.prepare("UPDATE tasks SET status = 'deleted', updated_at = ? WHERE id = ?").bind(now(), id).run();
  return json({ ok: true });
}

/** GET /api/tasks/:id/responses — owner sees all; a provider sees only their own. */
export async function listTaskResponses(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const task = await env.DB.prepare("SELECT customer_id FROM tasks WHERE id = ?").bind(id).first<{ customer_id: string }>();
  if (!task) return notFound();
  const isOwner = task.customer_id === auth.user.id;
  const sql = isOwner
    ? `SELECT r.*, u.name AS provider_name, u.town AS provider_town, u.county AS provider_county, u.provider_bio
       FROM responses r JOIN users u ON u.id = r.provider_id
       WHERE r.task_id = ? AND r.status != 'hidden' ORDER BY r.created_at DESC`
    : `SELECT r.*, u.name AS provider_name, u.town AS provider_town, u.county AS provider_county, u.provider_bio
       FROM responses r JOIN users u ON u.id = r.provider_id
       WHERE r.task_id = ? AND r.provider_id = ? ORDER BY r.created_at DESC`;
  const stmt = isOwner ? env.DB.prepare(sql).bind(id) : env.DB.prepare(sql).bind(id, auth.user.id);
  const { results } = await stmt.all<Record<string, unknown>>();
  const responses = (results ?? []).map((r) => ({
    id: r.id,
    task_id: r.task_id,
    message: r.message,
    quote_cents: r.quote_cents,
    status: r.status,
    created_at: r.created_at,
    provider: publicUser({
      id: r.provider_id as string,
      name: (r.provider_name as string) ?? null,
      town: (r.provider_town as string) ?? null,
      county: (r.provider_county as string) ?? null,
      provider_bio: (r.provider_bio as string) ?? null,
    }),
  }));
  return json({ responses });
}

/** POST /api/tasks/:id/select-response — owner picks a winner. */
export async function selectResponse(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  if (!task) return notFound();
  if (task.customer_id !== auth.user.id) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { response_id?: string };
  if (!body.response_id) return badRequest("response_id required");
  const resp = await env.DB.prepare("SELECT id FROM responses WHERE id = ? AND task_id = ?")
    .bind(body.response_id, id).first<{ id: string }>();
  if (!resp) return notFound();
  await env.DB.prepare("UPDATE tasks SET selected_response_id = ?, status = 'assigned', updated_at = ? WHERE id = ?")
    .bind(body.response_id, now(), id).run();
  await env.NOTIFICATION_QUEUE.send({ type: "response_selected", task_id: id, response_id: body.response_id });
  return json({ ok: true });
}
