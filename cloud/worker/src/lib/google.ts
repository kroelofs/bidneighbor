import type { Env } from "../types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfigured(env: Env): boolean {
  return !!env.GOOGLE_OAUTH_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET;
}

export function buildConsentUrl(env: Env, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface GoogleProfile {
  email: string;
  email_verified: boolean;
  name: string | null;
}

/** Exchange the authorization code and fetch the verified profile. */
export async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<GoogleProfile | null> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;

  const infoRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!info.email) return null;
  return {
    email: info.email.toLowerCase(),
    email_verified: info.email_verified !== false,
    name: info.name ?? null,
  };
}
