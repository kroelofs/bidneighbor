import type { Env } from "./types";

const DAY_MS = 86_400_000;
const HOT_DAYS = 30; // R2 Standard for the first 30 days
const TOTAL_DAYS = 90; // delete at 90 days total (60 days in Infrequent Access)
const BATCH = 200; // cap work per daily run; the next run picks up the rest

interface FileRow {
  id: string;
  r2_key: string;
  content_type: string | null;
}

/**
 * Daily image-retention sweep. Lifecycle for task photos in R2:
 *   0–30d   Standard (hot)
 *   30–90d  Infrequent Access (cold, cheaper)
 *   90d+    deleted (R2 object + D1 row)
 * ISO-8601 timestamps sort lexicographically, so string comparisons on
 * created_at are correct and use the idx_task_files_created index.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const nowMs = Date.now();
  const transitionBefore = new Date(nowMs - HOT_DAYS * DAY_MS).toISOString();
  const deleteBefore = new Date(nowMs - TOTAL_DAYS * DAY_MS).toISOString();

  // 1) Delete files past total retention (object first, then the metadata row).
  const expired = await env.DB.prepare(
    "SELECT id, r2_key, content_type FROM task_files WHERE created_at < ? ORDER BY created_at LIMIT ?",
  ).bind(deleteBefore, BATCH).all<FileRow>();
  for (const f of expired.results ?? []) {
    await env.TASK_UPLOADS.delete(f.r2_key);
    await env.DB.prepare("DELETE FROM task_files WHERE id = ?").bind(f.id).run();
  }

  // 2) Transition still-retained files older than 30d from Standard to Infrequent Access.
  const toCool = await env.DB.prepare(
    `SELECT id, r2_key, content_type FROM task_files
     WHERE created_at < ? AND created_at >= ? AND storage_class = 'Standard'
     ORDER BY created_at LIMIT ?`,
  ).bind(transitionBefore, deleteBefore, BATCH).all<FileRow>();
  for (const f of toCool.results ?? []) {
    const obj = await env.TASK_UPLOADS.get(f.r2_key);
    if (!obj) {
      // Object already gone — drop the dangling metadata row.
      await env.DB.prepare("DELETE FROM task_files WHERE id = ?").bind(f.id).run();
      continue;
    }
    // Re-put the same key with the cheaper storage class, preserving content-type.
    await env.TASK_UPLOADS.put(f.r2_key, obj.body, {
      storageClass: "InfrequentAccess",
      httpMetadata: obj.httpMetadata,
    });
    await env.DB.prepare("UPDATE task_files SET storage_class = 'InfrequentAccess' WHERE id = ?")
      .bind(f.id).run();
  }
}
