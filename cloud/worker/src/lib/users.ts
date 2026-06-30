import type { Env, UserRow } from "../types";
import { uuid, now } from "./http";

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first<UserRow>();
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

/**
 * Find an existing user by email, or create a fresh customer. Email is the
 * identity key, so magic-link and Google logins converge on one account.
 */
export async function findOrCreateByEmail(
  env: Env,
  email: string,
  opts: { name?: string | null; authProvider: string; avatarUrl?: string | null },
): Promise<UserRow> {
  const existing = await getUserByEmail(env, email);
  const ts = now();
  if (existing) {
    // Keep auth_provider (last used), backfill name, and refresh the avatar when
    // a new one is provided (e.g. each Google sign-in).
    const nextAvatar = opts.avatarUrl ?? existing.avatar_url;
    await env.DB.prepare("UPDATE users SET auth_provider = ?, name = COALESCE(NULLIF(name,''), ?), avatar_url = ?, updated_at = ? WHERE id = ?")
      .bind(opts.authProvider, opts.name ?? existing.name, nextAvatar, ts, existing.id)
      .run();
    return { ...existing, auth_provider: opts.authProvider, name: existing.name || opts.name || null, avatar_url: nextAvatar, updated_at: ts };
  }
  const user: UserRow = {
    id: uuid(),
    email: email.toLowerCase(),
    name: opts.name ?? null,
    phone: null,
    role: "customer",
    admin_level: null,
    auth_provider: opts.authProvider,
    town: null,
    county: null,
    provider_bio: null,
    avatar_url: opts.avatarUrl ?? null,
    theme_preference: "light",
    status: "active",
    notify_new_tasks: 1, // matches the column default; INSERT below relies on the DB default
    notify_responses: 1,
    created_at: ts,
    updated_at: ts,
  };
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, phone, role, admin_level, auth_provider, town, county, provider_bio, avatar_url, theme_preference, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(user.id, user.email, user.name, user.phone, user.role, user.admin_level, user.auth_provider, user.town, user.county, user.provider_bio, user.avatar_url, user.theme_preference, user.status, user.created_at, user.updated_at)
    .run();
  return user;
}
