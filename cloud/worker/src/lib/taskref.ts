import { slugify } from "./text";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build a shareable slug for a task: "<title>-<locality>-<id8>".
 *  The trailing 8 hex chars are the lookup key (see taskIdFilter). */
export function taskSlug(t: { id: string; title: string; town: string | null; county: string | null }): string {
  return [slugify(t.title), slugify(t.town || t.county || ""), t.id.slice(0, 8)]
    .filter(Boolean)
    .join("-");
}

/**
 * Turn a `/tasks/:ref` path segment (a full UUID from an old link, or a
 * "<title>-<locality>-<id8>" slug) into a SQL WHERE fragment over the task id.
 * Returns null if the ref can't be a task key.
 *
 * For a slug we match by the 8-char id prefix using a BINARY range so SQLite
 * uses the primary-key index (a SEARCH, not a SCAN — D1 bills rows scanned).
 */
export function taskIdFilter(ref: string, col = "id"): { clause: string; binds: string[] } | null {
  if (UUID_RE.test(ref)) return { clause: `${col} = ?`, binds: [ref.toLowerCase()] };
  const seg = (ref.split("-").pop() ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(seg)) return null;
  // seg + 'g' is greater than any hex string starting with seg (uuid char 9 is '-' < 'g').
  return { clause: `${col} >= ? AND ${col} < ?`, binds: [seg, seg + "g"] };
}
