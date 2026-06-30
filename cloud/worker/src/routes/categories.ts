import type { Env, AuthContext } from "../types";
import { json, badRequest, forbidden } from "../lib/http";
import { uuid, now } from "../lib/http";
import { slugify, sanitizeText } from "../lib/text";
import { isAdmin } from "../lib/guards";
import { audit } from "../lib/audit";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  is_active: number;
  created_at: string;
}

/** GET /api/categories — public, active only. */
export async function listCategories(_req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, slug, is_active, created_at FROM categories WHERE is_active = 1 ORDER BY name",
  ).all<CategoryRow>();
  return json({ categories: results ?? [] });
}

/** POST /api/admin/categories — admin only. */
export async function createCategory(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = sanitizeText(body.name, 60);
  if (!name) return badRequest("Category name required");
  const id = uuid();
  const slug = slugify(name);
  await env.DB.prepare("INSERT INTO categories (id, name, slug, is_active, created_at) VALUES (?, ?, ?, 1, ?)")
    .bind(id, name, slug, now())
    .run();
  await audit(env, auth, "category.create", { entityType: "category", entityId: id, meta: { name } });
  return json({ id, name, slug });
}

/** PATCH /api/admin/categories/:id — rename / activate / deactivate. */
export async function updateCategory(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { name?: string; is_active?: boolean };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.name === "string") {
    const name = sanitizeText(body.name, 60);
    sets.push("name = ?", "slug = ?");
    binds.push(name, slugify(name));
  }
  if (typeof body.is_active === "boolean") {
    sets.push("is_active = ?");
    binds.push(body.is_active ? 1 : 0);
  }
  if (!sets.length) return badRequest("Nothing to update");
  binds.push(id);
  await env.DB.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  await audit(env, auth, "category.update", { entityType: "category", entityId: id, meta: body });
  return json({ ok: true });
}
