import type { Env, Session, UserRow, AuthContext } from "../types";
import { sign, unsign, randomToken } from "./crypto";

const SESSION_COOKIE = "bn_session";
const SESSION_TTL_DAYS = 30;
const IMPERSONATION_TTL_MIN = 60;

function kvKey(id: string) {
  return `session:${id}`;
}

export async function createSession(
  env: Env,
  user: UserRow,
  opts: { impersonatorId?: string; impersonatorName?: string; impersonatorSessionId?: string } = {},
): Promise<{ id: string; cookie: string }> {
  const id = randomToken(32);
  const isImpersonation = !!opts.impersonatorId;
  const ttlSeconds = isImpersonation ? IMPERSONATION_TTL_MIN * 60 : SESSION_TTL_DAYS * 86400;
  const session: Session = {
    user_id: user.id,
    role: user.role,
    admin_level: user.admin_level,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    impersonator_id: opts.impersonatorId ?? null,
    impersonator_name: opts.impersonatorName ?? null,
    impersonator_session_id: opts.impersonatorSessionId ?? null,
  };
  await env.RATE_LIMITS.put(kvKey(id), JSON.stringify(session), { expirationTtl: ttlSeconds });
  const cookie = await buildCookie(env, id, ttlSeconds);
  return { id, cookie };
}

/**
 * Rebuild a signed cookie for an EXISTING session id, used to restore an admin's
 * own session after they stop impersonating (single host: the impersonation cookie
 * overwrote theirs). Returns null if the session is gone or expired — the caller
 * should clear the cookie instead. Max-Age tracks the session's remaining lifetime.
 */
export async function reissueCookie(env: Env, sessionId: string): Promise<string | null> {
  const stored = await env.RATE_LIMITS.get(kvKey(sessionId));
  if (!stored) return null;
  const session = JSON.parse(stored) as Session;
  const remainingSec = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
  if (remainingSec <= 0) return null;
  return buildCookie(env, sessionId, remainingSec);
}

async function buildCookie(env: Env, id: string, ttlSeconds: number): Promise<string> {
  const secret = env.SESSION_SIGNING_KEY || "dev-insecure-signing-key";
  const signed = await sign(id, secret);
  return `${SESSION_COOKIE}=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSeconds}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function resolveSession(req: Request, env: Env): Promise<AuthContext | null> {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;
  const secret = env.SESSION_SIGNING_KEY || "dev-insecure-signing-key";
  const id = await unsign(raw, secret);
  if (!id) return null;
  const stored = await env.RATE_LIMITS.get(kvKey(id));
  if (!stored) return null;
  const session = JSON.parse(stored) as Session;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await env.RATE_LIMITS.delete(kvKey(id));
    return null;
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(session.user_id).first<UserRow>();
  if (!user) return null;
  return { user, session, sessionId: id };
}

export async function destroySession(env: Env, id: string): Promise<void> {
  await env.RATE_LIMITS.delete(kvKey(id));
}

export const sessionConst = { SESSION_COOKIE, SESSION_TTL_DAYS, IMPERSONATION_TTL_MIN };
