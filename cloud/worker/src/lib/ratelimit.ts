import type { Env } from "../types";

/**
 * Simple fixed-window rate limiter backed by KV. Returns true if the request is
 * allowed, false if the limit is exceeded. Window resets via KV TTL.
 *
 * Good enough for login / post throttling. Not strongly consistent (KV is
 * eventually consistent), which is acceptable for abuse mitigation.
 */
export async function rateLimit(
  env: Env,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number }> {
  const key = `rl:${bucket}`;
  const current = await env.RATE_LIMITS.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count >= limit) return { ok: false, remaining: 0 };
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return { ok: true, remaining: limit - count - 1 };
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") || "unknown";
}
