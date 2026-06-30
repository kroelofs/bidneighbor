import type { Env, AuthContext } from "../types";
import { json, error, badRequest, redirect, unauthorized } from "../lib/http";
import { isEmail } from "../lib/text";
import { rateLimit, clientIp } from "../lib/ratelimit";
import { verifyTurnstile } from "../lib/turnstile";
import { randomToken } from "../lib/crypto";
import { createSession, clearCookie, destroySession } from "../lib/session";
import { findOrCreateByEmail } from "../lib/users";
import { selfUser } from "../lib/serialize";
import { buildConsentUrl, exchangeCode, googleConfigured } from "../lib/google";
import { audit } from "../lib/audit";

const MAGIC_TTL_SECONDS = 15 * 60;

/** POST /api/auth/request-link */
export async function requestLink(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { email?: string; turnstileToken?: string };
  if (!isEmail(body.email)) return badRequest("Enter a valid email");
  const ip = clientIp(req);
  const ipLimit = await rateLimit(env, `login:ip:${ip}`, 5, 15 * 60);
  if (!ipLimit.ok) return error(429, "Too many attempts. Try again later.");
  if (!(await verifyTurnstile(env, body.turnstileToken, req))) return badRequest("Spam check failed");

  const token = randomToken(32);
  await env.RATE_LIMITS.put(`magiclink:${token}`, body.email.toLowerCase(), { expirationTtl: MAGIC_TTL_SECONDS });
  const link = `${env.APP_BASE_URL}/api/auth/verify?token=${token}`;
  await env.NOTIFICATION_QUEUE.send({ type: "magic_link", email: body.email.toLowerCase(), link });
  return json({ ok: true, message: "Check your email for a sign-in link." });
}

/** GET /api/auth/verify?token=... */
export async function verifyLink(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return badRequest("Missing token");
  const email = await env.RATE_LIMITS.get(`magiclink:${token}`);
  if (!email) return redirect(`${env.APP_BASE_URL}/login?error=expired`);
  await env.RATE_LIMITS.delete(`magiclink:${token}`); // single use
  const user = await findOrCreateByEmail(env, email, { authProvider: "magic_link" });
  const { cookie } = await createSession(env, user);
  return redirect(`${env.APP_BASE_URL}/`, { "set-cookie": cookie });
}

/** GET /api/auth/google/start */
export async function googleStart(req: Request, env: Env): Promise<Response> {
  if (!googleConfigured(env)) return error(503, "Google sign-in is not configured");
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = randomToken(16);
  await env.RATE_LIMITS.put(`oauthstate:${state}`, origin, { expirationTtl: 600 });
  return redirect(buildConsentUrl(env, redirectUri, state));
}

/** GET /api/auth/google/callback */
export async function googleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return badRequest("Missing code/state");
  const savedOrigin = await env.RATE_LIMITS.get(`oauthstate:${state}`);
  if (!savedOrigin) return redirect(`${env.APP_BASE_URL}/login?error=state`);
  await env.RATE_LIMITS.delete(`oauthstate:${state}`);

  const redirectUri = `${savedOrigin}/api/auth/google/callback`;
  const profile = await exchangeCode(env, code, redirectUri);
  if (!profile || !profile.email_verified) return redirect(`${savedOrigin}/login?error=google`);

  const user = await findOrCreateByEmail(env, profile.email, { name: profile.name, authProvider: "google" });
  const { cookie } = await createSession(env, user);
  return redirect(`${savedOrigin}/`, { "set-cookie": cookie });
}

/** GET /api/me */
export async function me(_req: Request, _env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return json({ user: null });
  const impersonating = auth.session.impersonator_id
    ? { by_admin_id: auth.session.impersonator_id, by_admin_name: auth.session.impersonator_name ?? null }
    : null;
  return json({ user: selfUser(auth.user), impersonating });
}

/** POST /api/logout */
export async function logout(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (auth) await destroySession(env, auth.sessionId);
  return json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
}

/** POST /api/auth/stop-impersonation — ends an impersonation session, returns to admin. */
export async function stopImpersonation(_req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (!auth.session.impersonator_id) return badRequest("Not impersonating");
  await audit(env, auth, "impersonate.stop", { entityType: "user", entityId: auth.user.id });
  await destroySession(env, auth.sessionId);
  return json({ ok: true, return_to: env.ADMIN_BASE_URL }, { headers: { "set-cookie": clearCookie() } });
}
