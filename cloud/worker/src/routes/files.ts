import type { Env, AuthContext } from "../types";
import { json, badRequest, forbidden, unauthorized, notFound, uuid, now } from "../lib/http";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_TASK = 5;
const ALLOWED = new Map<string, number[]>([
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF (WEBP container)
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
]);

function magicOk(contentType: string, bytes: Uint8Array): boolean {
  const sig = ALLOWED.get(contentType);
  if (!sig) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/** POST /api/tasks/:id/files — Worker-mediated R2 upload, owner only. multipart/form-data with `file`. */
export async function uploadTaskFile(req: Request, env: Env, auth: AuthContext | null, taskId: string): Promise<Response> {
  if (!auth) return unauthorized();
  const task = await env.DB.prepare("SELECT customer_id FROM tasks WHERE id = ?").bind(taskId).first<{ customer_id: string }>();
  if (!task) return notFound();
  if (task.customer_id !== auth.user.id) return forbidden();

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM task_files WHERE task_id = ?").bind(taskId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_FILES_PER_TASK) return badRequest("Too many files on this task");

  const form = await req.formData();
  const entry = form.get("file");
  if (!entry || typeof entry === "string") return badRequest("No file");
  const file = entry as { size: number; type: string; name: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > MAX_BYTES) return badRequest("File too large (max 10 MB)");

  const buf = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type;
  if (!magicOk(contentType, buf)) return badRequest("Only JPG, PNG, WebP, or PDF files are allowed");

  const id = uuid();
  const r2Key = `tasks/${taskId}/${id}`;
  await env.TASK_UPLOADS.put(r2Key, buf, { httpMetadata: { contentType } });
  await env.DB.prepare(
    "INSERT INTO task_files (id, task_id, r2_key, filename, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, taskId, r2Key, (file.name || "upload").slice(0, 200), contentType, file.size, now()).run();
  return json({ id, content_type: contentType });
}

/** GET /api/files/:id — stream a task file from R2 (public; files belong to public tasks). */
export async function serveFile(_req: Request, env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT r2_key, content_type FROM task_files WHERE id = ?")
    .bind(id).first<{ r2_key: string; content_type: string }>();
  if (!row) return notFound();
  const obj = await env.TASK_UPLOADS.get(row.r2_key);
  if (!obj) return notFound();
  return new Response(obj.body, {
    headers: { "content-type": row.content_type, "cache-control": "public, max-age=86400" },
  });
}
