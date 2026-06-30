import type { Env, AuthContext } from "../types";
import { json, unauthorized, now } from "../lib/http";

/** GET /api/providers — public directory. Returns ONLY name + city/state/zip;
 *  never email, phone, or street address. */
export async function listProviders(_req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, city, state, zip FROM users
     WHERE role = 'provider' AND status = 'active'
     ORDER BY state, city, name LIMIT 500`,
  ).all<{ id: string; name: string | null; city: string | null; state: string | null; zip: string | null }>();
  return json({ providers: results ?? [] });
}

/** GET /api/provider/tasks — open tasks matching this provider's county + subscribed categories. */
export async function providerTasks(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.category_id, c.name AS category_name, t.town, t.county, t.timeframe, t.budget_cents, t.created_at
     FROM tasks t
     JOIN categories c ON c.id = t.category_id
     JOIN user_categories uc ON uc.category_id = t.category_id AND uc.user_id = ?
     WHERE t.status = 'open' AND (t.county = ? OR ? IS NULL)
     ORDER BY t.created_at DESC LIMIT 100`,
  ).bind(auth.user.id, auth.user.county, auth.user.county).all();
  return json({ tasks: results ?? [] });
}

/** GET /api/provider/responses — this provider's responses. */
export async function providerResponses(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.task_id, r.message, r.quote_cents, r.status, r.created_at, t.title AS task_title, t.status AS task_status
     FROM responses r JOIN tasks t ON t.id = r.task_id
     WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 100`,
  ).bind(auth.user.id).all();
  return json({ responses: results ?? [] });
}

/** GET /api/provider/categories — which categories this provider is subscribed to. */
export async function getProviderCategories(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const { results } = await env.DB.prepare("SELECT category_id FROM user_categories WHERE user_id = ?")
    .bind(auth.user.id).all<{ category_id: string }>();
  return json({ category_ids: (results ?? []).map((r) => r.category_id) });
}

/** PUT /api/provider/categories — replace the subscription set; promotes user to provider role. */
export async function putProviderCategories(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { category_ids?: string[] };
  const ids = Array.isArray(body.category_ids) ? body.category_ids.filter((x) => typeof x === "string").slice(0, 50) : [];
  const batch: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM user_categories WHERE user_id = ?").bind(auth.user.id),
  ];
  for (const cid of ids) {
    batch.push(
      env.DB.prepare("INSERT OR IGNORE INTO user_categories (user_id, category_id) VALUES (?, ?)").bind(auth.user.id, cid),
    );
  }
  // Becoming a provider when you subscribe to categories (unless already admin).
  if (auth.user.admin_level === null) {
    batch.push(env.DB.prepare("UPDATE users SET role = 'provider', updated_at = ? WHERE id = ? AND role = 'customer'").bind(now(), auth.user.id));
  }
  await env.DB.batch(batch);
  return json({ ok: true, category_ids: ids });
}

/** PATCH /api/me — update own profile (name, phone, town, county, bio, theme). */
export async function updateProfile(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: Array<[string, string]> = [
    ["name", "name"], ["phone", "phone"], ["town", "town"], ["county", "county"], ["provider_bio", "provider_bio"],
    ["street_address", "street_address"], ["city", "city"], ["state", "state"], ["zip", "zip"],
  ];
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, col] of fields) {
    if (typeof body[key] === "string") { sets.push(`${col} = ?`); binds.push((body[key] as string).slice(0, 500)); }
  }
  if (body.theme_preference === "light" || body.theme_preference === "dark") {
    sets.push("theme_preference = ?"); binds.push(body.theme_preference);
  }
  if (body.last_mode === "neighbor" || body.last_mode === "provider") {
    sets.push("last_mode = ?"); binds.push(body.last_mode);
  }
  for (const key of ["notify_new_tasks", "notify_responses"] as const) {
    if (typeof body[key] === "boolean" || body[key] === 0 || body[key] === 1) {
      sets.push(`${key} = ?`); binds.push(body[key] ? 1 : 0);
    }
  }
  // Geocoded coords (from address autocomplete). Only written when finite numbers are
  // sent — a manual address entry omits them and never clobbers existing coords.
  for (const key of ["latitude", "longitude"] as const) {
    if (typeof body[key] === "number" && Number.isFinite(body[key] as number)) {
      sets.push(`${key} = ?`); binds.push(body[key]);
    }
  }
  if (!sets.length) return json({ ok: true });
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(auth.user.id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return json({ ok: true });
}
