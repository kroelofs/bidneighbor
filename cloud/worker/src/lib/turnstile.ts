import type { Env } from "../types";
import { clientIp } from "./ratelimit";

/**
 * Verify a Cloudflare Turnstile token server-side. If no secret is configured
 * (local dev), verification is skipped and returns true with a warning shape.
 */
export async function verifyTurnstile(env: Env, token: unknown, req: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // dev: not configured
  if (typeof token !== "string" || !token) return false;
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  body.set("remoteip", clientIp(req));
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
