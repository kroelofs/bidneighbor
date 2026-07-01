import type { Env, AuthContext } from "../types";
import { json, error, badRequest, forbidden, unauthorized, notFound, uuid, now } from "../lib/http";
import { sanitizeText, toCents } from "../lib/text";
import { isSuspended, isAdmin } from "../lib/guards";
import { rateLimit } from "../lib/ratelimit";
import { screenText } from "../lib/moderation";
import { draftResourceFromImage } from "../lib/ai";
import { audit } from "../lib/audit";
import { publicUser } from "../lib/serialize";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
const ALLOWED_IMAGES = new Map<string, number[]>([
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
]);
function imageMagicOk(contentType: string, bytes: Uint8Array): boolean {
  const sig = ALLOWED_IMAGES.get(contentType);
  if (!sig) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // build in chunks so String.fromCharCode doesn't blow the arg limit
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface ResourceRow {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category_id: string | null;
  daily_rate_cents: number | null;
  deposit_cents: number | null;
  town: string | null;
  county: string | null;
  status: string;
  moderation_state: string;
  created_at: string;
  updated_at: string;
}

function serializeResource(r: ResourceRow, extra: Record<string, unknown> = {}) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category_id: r.category_id,
    daily_rate_cents: r.daily_rate_cents,
    deposit_cents: r.deposit_cents,
    town: r.town,
    county: r.county,
    status: r.status,
    created_at: r.created_at,
    ...extra,
  };
}

/** GET /api/resources — public browse of active listings; filter by county/category/q. */
export async function listResources(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const county = url.searchParams.get("county");
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");
  const clauses = ["r.status = 'active'"];
  const binds: unknown[] = [];
  if (county) { clauses.push("r.county = ?"); binds.push(county); }
  if (category) { clauses.push("r.category_id = ?"); binds.push(category); }
  if (q) { clauses.push("(r.title LIKE ? OR r.description LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }
  const { results } = await env.DB.prepare(
    `SELECT r.*, u.name AS owner_name, u.town AS owner_town, u.county AS owner_county, u.provider_bio AS owner_bio,
            (SELECT id FROM resource_files f WHERE f.resource_id = r.id ORDER BY f.created_at ASC LIMIT 1) AS cover_file_id
     FROM resources r JOIN users u ON u.id = r.owner_id
     WHERE ${clauses.join(" AND ")} ORDER BY r.created_at DESC LIMIT 100`,
  ).bind(...binds).all<ResourceRow & Record<string, unknown>>();
  const resources = (results ?? []).map((r) =>
    serializeResource(r, {
      cover_file_id: r.cover_file_id ?? null,
      owner: publicUser({
        id: r.owner_id, name: (r.owner_name as string) ?? null,
        town: (r.owner_town as string) ?? null, county: (r.owner_county as string) ?? null,
        provider_bio: (r.owner_bio as string) ?? null,
      }),
    }),
  );
  return json({ resources });
}

/** GET /api/resources/:id — public detail; owner also sees their own flagged/hidden. */
export async function getResource(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT r.*, u.name AS owner_name, u.town AS owner_town, u.county AS owner_county, u.provider_bio AS owner_bio
     FROM resources r JOIN users u ON u.id = r.owner_id WHERE r.id = ?`,
  ).bind(id).first<ResourceRow & Record<string, unknown>>();
  if (!r || r.status === "removed") return notFound();
  const isOwner = !!auth && auth.user.id === r.owner_id;
  if (r.status !== "active" && !isOwner) return notFound();
  const { results: files } = await env.DB.prepare(
    "SELECT id, content_type FROM resource_files WHERE resource_id = ? ORDER BY created_at ASC",
  ).bind(id).all<{ id: string; content_type: string }>();
  return json({
    resource: serializeResource(r, {
      moderation_state: r.moderation_state,
      is_owner: isOwner,
      owner: publicUser({
        id: r.owner_id, name: (r.owner_name as string) ?? null,
        town: (r.owner_town as string) ?? null, county: (r.owner_county as string) ?? null,
        provider_bio: (r.owner_bio as string) ?? null,
      }),
      files: files ?? [],
    }),
  });
}

/** POST /api/resources — create a listing (session; sync keyword gate; async AI review). */
export async function createResource(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();
  const rl = await rateLimit(env, `resource:create:${auth.user.id}`, 10, 3600);
  if (!rl.ok) return error(429, "You've posted a lot recently — try again later");

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = sanitizeText(body.title, 120);
  const description = sanitizeText(body.description, 4000);
  if (!title || !description) return badRequest("Title and description are required");

  const screen = screenText(`${title}\n${description}`);
  if (screen.blocked) return badRequest(`That listing can't be posted (${screen.reason}).`);

  const id = uuid();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO resources (id, owner_id, title, description, category_id, daily_rate_cents, deposit_cents, town, county, status, moderation_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', ?, ?)`,
  ).bind(
    id, auth.user.id, title, description,
    typeof body.category_id === "string" ? body.category_id : null,
    toCents(body.daily_rate), toCents(body.deposit),
    sanitizeText(body.town, 80) || auth.user.town, sanitizeText(body.county, 80) || auth.user.county,
    ts, ts,
  ).run();
  await env.NOTIFICATION_QUEUE.send({ type: "moderate_resource", resource_id: id });
  return json({ id });
}

/**
 * POST /api/resources/draft — AI-suggest listing fields from an equipment photo (session).
 * Returns suggestions only; the user reviews/edits before posting. town/county come from the
 * user's own profile (a photo can't reveal location), not from the model.
 */
export async function draftResource(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (isSuspended(auth)) return forbidden();
  const rl = await rateLimit(env, `resource:draft:${auth.user.id}`, 30, 3600);
  if (!rl.ok) return error(429, "You've used auto-fill a lot — try again later");

  const form = await req.formData();
  const entry = form.get("file");
  if (!entry || typeof entry === "string") return badRequest("No image");
  const file = entry as { size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > MAX_IMAGE_BYTES) return badRequest("Image too large (max 10 MB)");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!imageMagicOk(file.type, buf)) return badRequest("Only JPG, PNG, or WebP images are allowed");

  const draft = await draftResourceFromImage(env, `data:${file.type};base64,${toBase64(buf)}`);
  if (!draft) return error(503, "Auto-fill isn't available right now — please fill the details in manually.");

  return json({
    title: draft.title ?? "",
    description: draft.description ?? "",
    daily_rate: draft.daily_rate ?? null,
    town: auth.user.town,
    county: auth.user.county,
  });
}

/** PATCH /api/resources/:id — owner edit; re-screen and re-queue moderation. */
export async function updateResource(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const r = await env.DB.prepare("SELECT owner_id, title, description FROM resources WHERE id = ?")
    .bind(id).first<{ owner_id: string; title: string; description: string }>();
  if (!r) return notFound();
  if (r.owner_id !== auth.user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: unknown[] = [];
  let nextTitle = r.title, nextDesc = r.description, textChanged = false;
  if (typeof body.title === "string") { nextTitle = sanitizeText(body.title, 120); sets.push("title = ?"); binds.push(nextTitle); textChanged = true; }
  if (typeof body.description === "string") { nextDesc = sanitizeText(body.description, 4000); sets.push("description = ?"); binds.push(nextDesc); textChanged = true; }
  if (typeof body.category_id === "string") { sets.push("category_id = ?"); binds.push(body.category_id); }
  if (body.daily_rate !== undefined) { sets.push("daily_rate_cents = ?"); binds.push(toCents(body.daily_rate)); }
  if (body.deposit !== undefined) { sets.push("deposit_cents = ?"); binds.push(toCents(body.deposit)); }
  if (typeof body.town === "string") { sets.push("town = ?"); binds.push(sanitizeText(body.town, 80)); }
  if (typeof body.county === "string") { sets.push("county = ?"); binds.push(sanitizeText(body.county, 80)); }
  if (!sets.length) return badRequest("Nothing to update");

  if (textChanged) {
    const screen = screenText(`${nextTitle}\n${nextDesc}`);
    if (screen.blocked) return badRequest(`That edit can't be saved (${screen.reason}).`);
    sets.push("moderation_state = 'pending'");
  }
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(id);
  await env.DB.prepare(`UPDATE resources SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  if (textChanged) await env.NOTIFICATION_QUEUE.send({ type: "moderate_resource", resource_id: id });
  return json({ ok: true });
}

/** DELETE /api/resources/:id — owner soft-delete. */
export async function deleteResource(_req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const r = await env.DB.prepare("SELECT owner_id FROM resources WHERE id = ?").bind(id).first<{ owner_id: string }>();
  if (!r) return notFound();
  if (r.owner_id !== auth.user.id) return forbidden();
  await env.DB.prepare("UPDATE resources SET status = 'removed', updated_at = ? WHERE id = ?").bind(now(), id).run();
  return json({ ok: true });
}

/** POST /api/resources/:id/files — owner uploads an equipment photo. */
export async function uploadResourceFile(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const r = await env.DB.prepare("SELECT owner_id FROM resources WHERE id = ?").bind(id).first<{ owner_id: string }>();
  if (!r) return notFound();
  if (r.owner_id !== auth.user.id) return forbidden();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM resource_files WHERE resource_id = ?").bind(id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_FILES) return badRequest("Too many photos on this listing");

  const form = await req.formData();
  const entry = form.get("file");
  if (!entry || typeof entry === "string") return badRequest("No image");
  const file = entry as { size: number; type: string; name: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > MAX_IMAGE_BYTES) return badRequest("Image too large (max 10 MB)");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!imageMagicOk(file.type, buf)) return badRequest("Only JPG, PNG, or WebP images are allowed");

  const fileId = uuid();
  const r2Key = `resources/${id}/${fileId}`;
  await env.TASK_UPLOADS.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
  await env.DB.prepare(
    "INSERT INTO resource_files (id, resource_id, r2_key, filename, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(fileId, id, r2Key, (file.name || "photo").slice(0, 200), file.type, file.size, now()).run();
  return json({ id: fileId, content_type: file.type });
}

/** GET /api/resources/:rid/files/:fid — stream a listing photo (public; listings are public). */
export async function serveResourceFile(_req: Request, env: Env, rid: string, fid: string): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT r2_key, content_type FROM resource_files WHERE id = ? AND resource_id = ?",
  ).bind(fid, rid).first<{ r2_key: string; content_type: string }>();
  if (!row) return notFound();
  const obj = await env.TASK_UPLOADS.get(row.r2_key);
  if (!obj) return notFound();
  return new Response(obj.body, {
    headers: { "content-type": row.content_type, "cache-control": "public, max-age=86400" },
  });
}

/** POST /api/resources/:id/report — any signed-in user flags a listing for admin review. */
export async function reportResource(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!auth) return unauthorized();
  const r = await env.DB.prepare("SELECT id FROM resources WHERE id = ?").bind(id).first<{ id: string }>();
  if (!r) return notFound();
  const rl = await rateLimit(env, `resource:report:${auth.user.id}`, 20, 3600);
  if (!rl.ok) return error(429, "You've reported a lot recently — try again later");
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = sanitizeText(body.reason, 500) || "user report";
  await env.DB.prepare(
    "INSERT INTO admin_flags (id, entity_type, entity_id, reason, status, created_at) VALUES (?, 'resource', ?, ?, 'open', ?)",
  ).bind(uuid(), id, `reported by ${auth.user.id}: ${reason}`, now()).run();
  return json({ ok: true });
}

// ---- Admin (admin host only; gated in router) ----

/** GET /api/admin/resources — moderation queue; filter by status. */
export async function adminListResources(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const status = new URL(req.url).searchParams.get("status");
  const stmt = status
    ? env.DB.prepare("SELECT * FROM resources WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status)
    : env.DB.prepare("SELECT * FROM resources ORDER BY created_at DESC LIMIT 200");
  const { results } = await stmt.all<ResourceRow>();
  return json({ resources: results ?? [] });
}

/** PATCH /api/admin/resources/:id — approve / hide / remove; resolve linked flags; audit. */
export async function adminUpdateResource(req: Request, env: Env, auth: AuthContext | null, id: string): Promise<Response> {
  if (!isAdmin(auth)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !["active", "hidden", "removed"].includes(body.status)) return badRequest("Bad status");
  // Approving a listing clears the AI flag; hiding/removing leaves the verdict for the record.
  const modState = body.status === "active" ? "clear" : undefined;
  await env.DB.prepare(
    `UPDATE resources SET status = ?, ${modState ? "moderation_state = ?, " : ""}updated_at = ? WHERE id = ?`,
  ).bind(...(modState ? [body.status, modState, now(), id] : [body.status, now(), id])).run();
  await env.DB.prepare("UPDATE admin_flags SET status = 'resolved' WHERE entity_type = 'resource' AND entity_id = ? AND status = 'open'").bind(id).run();
  await audit(env, auth, "resource.moderate", { entityType: "resource", entityId: id, meta: body });
  return json({ ok: true });
}
