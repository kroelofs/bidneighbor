/**
 * Treat all user-supplied text as untrusted. We store a cleaned version and the
 * frontend renders it as text (never dangerouslySetInnerHTML). This strips
 * control characters and trims; HTML is neutralized by escaping angle brackets so
 * even a misuse downstream can't inject markup.
 */
export function sanitizeText(input: unknown, maxLen = 5000): string {
  if (typeof input !== "string") return "";
  // Strip C0 control chars except tab (\x09), newline (\x0A), carriage return (\x0D).
  let s = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 254;
}

/** Parse a budget string/number into integer cents, or null. */
export function toCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
