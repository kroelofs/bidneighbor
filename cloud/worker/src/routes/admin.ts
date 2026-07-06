import type { Env, AuthContext, UserRow } from "../types";
import { json, badRequest, forbidden, notFound, now } from "../lib/http";
import { isAdmin, canImpersonate } from "../lib/guards";
import { audit } from "../lib/audit";
import { EDITABLE_SECRETS, isEditableSecretKey, isSecretConfigured, setSecret } from "../lib/secrets";
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
 * Creates a short-lived impersonation session and returns a one-time URL the admin
 * UI redirects to (a bounce that cleanly set-cookies via a 302 rather than over XHR).
 * Records impersonator_id + the admin's own session id (so "stop" can restore it) and
 * an audit row. platform_manager may NOT impersonate.
 */
export async function adminImpersonate(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!canImpersonate(auth)) return forbidden();
  const target = await getUserById(env, id);
  if (!target) return notFound();
  if (target.admin_level === "superadmin" && auth!.user.admin_level !== "superadmin") return forbidden();

  const { id: sid, cookie } = await createSession(env, target, {
    impersonatorId: auth!.user.id,
    impersonatorName: auth!.user.name ?? auth!.user.email,
    impersonatorSessionId: auth!.sessionId,
  });
  await audit(env, auth, "impersonate.start", { entityType: "user", entityId: id, meta: { session: sid } });

  // Bounce through a one-time token so the impersonation cookie is set via a 302
  // (not stored from an XHR response). Single host, so the cookie replaces the
  // admin's own — stop-impersonation restores it from impersonator_session_id.
  const handoff = randomToken(24);
  await env.RATE_LIMITS.put(`handoff:${handoff}`, cookie, { expirationTtl: 120 });
  return json({ redirect_url: `${env.APP_BASE_URL}/api/auth/impersonate-land?h=${handoff}` });
}

/**
 * GET /api/auth/impersonate-land?h=... — consumes the one-time token, sets the
 * impersonation cookie and redirects into the app.
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

interface IntegrationStatus {
  key: string;
  name: string;
  category: string;
  kind: "secret" | "binding";
  required: boolean;
  /** Configured = the secret is set / the binding exists. Never exposes the value. */
  configured: boolean;
  /** Live probe result where cheap to run; null when not probed. */
  healthy: boolean | null;
  /** True when the key can be set live from this page (stored as a KV override). */
  editable?: boolean;
  detail: string;
  setup: string;
}

/**
 * GET /api/admin/integrations — status of external integrations. Returns ONLY
 * booleans (configured/healthy) — never secret values. Editable keys (Resend,
 * OpenRouter) can be set live via POST (see adminUpdateIntegration); the rest are
 * deploy-time `wrangler secret`s and remain read-only diagnostics here.
 */
export async function adminIntegrations(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();

  // Cheap liveness probes for bindings that support them.
  let dbHealthy: boolean | null = null;
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }
  let kvHealthy: boolean | null = null;
  try {
    await env.RATE_LIMITS.get("__healthcheck");
    kvHealthy = true;
  } catch {
    kvHealthy = false;
  }
  let r2Healthy: boolean | null = null;
  try {
    await env.TASK_UPLOADS.head("__healthcheck"); // null for missing key = success
    r2Healthy = true;
  } catch {
    r2Healthy = false;
  }

  const has = (v: unknown) => typeof v === "string" && v.length > 0;
  const sessionSecure = has(env.SESSION_SIGNING_KEY) && env.SESSION_SIGNING_KEY !== "dev-insecure-signing-key";
  // Editable keys may be set as a live KV override or via env — check both.
  const resendConfigured = await isSecretConfigured(env, "EMAIL_API_KEY");
  const openrouterConfigured = await isSecretConfigured(env, "OPENROUTER_API_KEY");

  const integrations: IntegrationStatus[] = [
    {
      key: "google_oauth", name: "Google Sign-In", category: "Authentication", kind: "secret", required: false,
      configured: has(env.GOOGLE_OAUTH_CLIENT_ID) && has(env.GOOGLE_OAUTH_CLIENT_SECRET), healthy: null,
      detail: "OAuth 2.0 client for \"Continue with Google\". When unset, the button returns 503.",
      setup: "Create a Web OAuth client in Google Cloud Console; set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET via `wrangler secret put`.",
    },
    {
      key: "session_key", name: "Session signing key", category: "Authentication", kind: "secret", required: true,
      configured: sessionSecure, healthy: sessionSecure ? true : false,
      detail: sessionSecure ? "Session cookies are HMAC-signed with a configured key." : "Using the insecure dev fallback — set a real key before production.",
      setup: "Generate 32+ random bytes and set SESSION_SIGNING_KEY via `wrangler secret put`.",
    },
    {
      key: "resend", name: "Resend (email)", category: "Email", kind: "secret", required: true, editable: true,
      configured: resendConfigured, healthy: null,
      detail: resendConfigured ? `Transactional email enabled. From: ${env.EMAIL_FROM}` : "No Resend API key — magic-link & notification emails are logged to the console instead of sent.",
      setup: "Verify the bidneighbor.com domain in Resend (SPF/DKIM), create an API key at resend.com/api-keys, then paste it below.",
    },
    {
      key: "turnstile", name: "Cloudflare Turnstile", category: "Anti-spam", kind: "secret", required: false,
      configured: has(env.TURNSTILE_SECRET_KEY), healthy: null,
      detail: has(env.TURNSTILE_SECRET_KEY) ? "Spam checks enforced on login & post forms." : "No TURNSTILE_SECRET_KEY — spam checks auto-pass (dev mode).",
      setup: "Create a Turnstile widget in the Cloudflare dashboard; set TURNSTILE_SECRET_KEY via `wrangler secret put` and the site key in the frontend.",
    },
    {
      key: "openrouter", name: "OpenRouter (AI moderation)", category: "AI", kind: "secret", required: false, editable: true,
      configured: openrouterConfigured, healthy: null,
      detail: openrouterConfigured ? "AI content moderation runs on new resource listings (off the request path, in the queue consumer)." : "No OpenRouter API key — AI moderation is skipped and listings are treated as clear (heuristics + user reports still apply).",
      setup: "Create an API key at openrouter.ai/keys, then paste it below.",
    },
    {
      key: "d1", name: "D1 database", category: "Cloudflare", kind: "binding", required: true,
      configured: true, healthy: dbHealthy,
      detail: dbHealthy ? "Connected — query succeeded." : "Bound but a test query failed. Check the database_id in wrangler.toml and that migrations ran.",
      setup: "`wrangler d1 create bidneighbor` and paste database_id into cloud/wrangler.toml.",
    },
    {
      key: "kv", name: "KV (sessions / rate limits)", category: "Cloudflare", kind: "binding", required: true,
      configured: true, healthy: kvHealthy,
      detail: kvHealthy ? "Connected — read succeeded." : "Bound but a test read failed. Check the KV namespace id in wrangler.toml.",
      setup: "`wrangler kv namespace create RATE_LIMITS` and paste id into cloud/wrangler.toml.",
    },
    {
      key: "r2", name: "R2 (task uploads)", category: "Cloudflare", kind: "binding", required: true,
      configured: true, healthy: r2Healthy,
      detail: r2Healthy ? "Connected — head succeeded." : "Bound but a test head failed. Check the bucket exists.",
      setup: "`wrangler r2 bucket create bidneighbor-uploads`.",
    },
    {
      key: "queue", name: "Queues (notifications)", category: "Cloudflare", kind: "binding", required: true,
      configured: true, healthy: null,
      detail: "Notification fan-out queue. No cheap read probe; verify via the notifications table after a task is posted.",
      setup: "`wrangler queues create bidneighbor-notifications`.",
    },
  ];

  return json({
    // Cloudflare bindings (D1/KV/R2/Queues) are infra, not user-managed integrations — hidden from the UI.
    integrations: integrations.filter((i) => i.category !== "Cloudflare"),
    deploy: { sha: env.GIT_SHA ?? "dev", deployed_at: env.DEPLOYED_AT ?? null },
  });
}

/**
 * POST /api/admin/integrations/:key — set an editable API key (Resend, OpenRouter).
 * The value is written to KV as a live override, since deploy-time `wrangler secret`s
 * can't be written at runtime. The value is never logged or echoed back; the audit
 * entry records only which key changed.
 */
export async function adminUpdateIntegration(req: Request, env: Env, auth: AuthContext | null, key: string): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  if (!isEditableSecretKey(key)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { value?: unknown };
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value) return badRequest("Missing value");
  await setSecret(env, EDITABLE_SECRETS[key].envName, value);
  await audit(env, auth, "integration.update", { entityType: "integration", entityId: key });
  return json({ ok: true });
}
