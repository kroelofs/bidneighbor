import type { Env, AuthContext, UserRow } from "../types";
import { json, badRequest, forbidden, notFound, now } from "../lib/http";
import { isAdmin, canImpersonate } from "../lib/guards";
import { audit } from "../lib/audit";
import { createSession } from "../lib/session";
import { getUserById } from "../lib/users";
import { randomToken } from "../lib/crypto";

/**
 * All admin handlers are reached ONLY on the admin host (mounted there in the
 * router) AND behind Cloudflare Access. We STILL re-check role here — three gates.
 */

/** GET /api/admin/users */
export async function adminListUsers(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const q = new URL(req.url).searchParams.get("q");
  const stmt = q
    ? env.DB.prepare("SELECT * FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 200").bind(`%${q}%`, `%${q}%`)
    : env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 200");
  const { results } = await stmt.all<UserRow>();
  return json({ users: results ?? [] });
}

/** PATCH /api/admin/users/:id — role, admin_level, status. */
export async function adminUpdateUser(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { role?: string; admin_level?: string | null; status?: string };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.role && ["customer", "provider", "admin"].includes(body.role)) { sets.push("role = ?"); binds.push(body.role); }
  if (body.status && ["active", "suspended"].includes(body.status)) { sets.push("status = ?"); binds.push(body.status); }
  // Only superadmin may grant/revoke admin levels.
  if (body.admin_level !== undefined) {
    if (auth!.user.admin_level !== "superadmin") return forbidden();
    const lvl = body.admin_level;
    if (lvl !== null && !["superadmin", "admin", "platform_manager"].includes(lvl)) return badRequest("Bad admin_level");
    sets.push("admin_level = ?"); binds.push(lvl);
  }
  if (!sets.length) return badRequest("Nothing to update");
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  await audit(env, auth, "user.update", { entityType: "user", entityId: id, meta: body });
  return json({ ok: true });
}

/**
 * POST /api/admin/users/:id/impersonate — "Log in as user."
 * Creates a short-lived impersonation session on the USER app host and returns a
 * one-time URL the admin UI redirects to. Records impersonator_id on the session
 * and an audit row. platform_manager may NOT impersonate.
 */
export async function adminImpersonate(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!canImpersonate(auth)) return forbidden();
  const target = await getUserById(env, id);
  if (!target) return notFound();
  if (target.admin_level === "superadmin" && auth!.user.admin_level !== "superadmin") return forbidden();

  const { id: sid, cookie } = await createSession(env, target, {
    impersonatorId: auth!.user.id,
    impersonatorName: auth!.user.name ?? auth!.user.email,
  });
  await audit(env, auth, "impersonate.start", { entityType: "user", entityId: id, meta: { session: sid } });

  // Hand the cookie to the user app via a one-time bounce token stored in KV.
  const handoff = randomToken(24);
  await env.RATE_LIMITS.put(`handoff:${handoff}`, cookie, { expirationTtl: 120 });
  return json({ redirect_url: `${env.APP_BASE_URL}/api/auth/impersonate-land?h=${handoff}` });
}

/**
 * GET /api/auth/impersonate-land?h=... — runs on the USER host, sets the
 * impersonation cookie (which is scoped to that host) and redirects into the app.
 */
export async function impersonateLand(req: Request, env: Env): Promise<Response> {
  const h = new URL(req.url).searchParams.get("h");
  if (!h) return json({ error: "bad handoff" }, { status: 400 });
  const cookie = await env.RATE_LIMITS.get(`handoff:${h}`);
  if (!cookie) return json({ error: "expired" }, { status: 400 });
  await env.RATE_LIMITS.delete(`handoff:${h}`);
  return new Response(null, { status: 302, headers: { location: `${env.APP_BASE_URL}/`, "set-cookie": cookie } });
}

/** GET /api/admin/tasks */
export async function adminListTasks(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const status = new URL(req.url).searchParams.get("status");
  const stmt = status
    ? env.DB.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status)
    : env.DB.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200");
  const { results } = await stmt.all();
  return json({ tasks: results ?? [] });
}

/** PATCH /api/admin/tasks/:id — change status / hide / remove. */
export async function adminUpdateTask(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !["open", "assigned", "completed", "cancelled", "hidden"].includes(body.status)) {
    return badRequest("Bad status");
  }
  await env.DB.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").bind(body.status, now(), id).run();
  await audit(env, auth, "task.moderate", { entityType: "task", entityId: id, meta: body });
  return json({ ok: true });
}

/** GET /api/admin/audit-log */
export async function adminAuditLog(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const { results } = await env.DB.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
  return json({ entries: results ?? [] });
}
