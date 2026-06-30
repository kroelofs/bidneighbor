/** Minimal path matcher supporting :params, e.g. match("/api/tasks/:id", pathname). */
export function match(pattern: string, pathname: string): Record<string, string> | null {
  const pParts = pattern.split("/").filter(Boolean);
  const uParts = pathname.split("/").filter(Boolean);
  if (pParts.length !== uParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const p = pParts[i];
    const u = uParts[i];
    if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(u);
    else if (p !== u) return null;
  }
  return params;
}
