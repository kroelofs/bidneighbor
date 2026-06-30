/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // Bindings
  DB: D1Database;
  TASK_UPLOADS: R2Bucket;
  RATE_LIMITS: KVNamespace;
  NOTIFICATION_QUEUE: Queue<NotificationJob>;
  ASSETS: Fetcher;

  // Vars (wrangler.toml [vars])
  APP_BASE_URL: string;
  ADMIN_BASE_URL: string;
  EMAIL_FROM: string;
  APP_HOST: string;
  ADMIN_HOST: string;

  // Secrets (wrangler secret put)
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_PLACES_API_KEY?: string;
  SESSION_SIGNING_KEY?: string;

  // Injected at build/deploy time (see deploy.yml)
  GIT_SHA?: string;
  DEPLOYED_AT?: string;
}

export type Role = "customer" | "provider" | "admin";
export type AdminLevel = "superadmin" | "admin" | "platform_manager";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: Role;
  admin_level: AdminLevel | null;
  auth_provider: string | null;
  town: string | null;
  county: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  provider_bio: string | null;
  avatar_url: string | null;
  theme_preference: "light" | "dark";
  status: "active" | "suspended";
  notify_new_tasks: number; // 0|1 — provider "new matching task" emails
  notify_responses: number; // 0|1 — "new response" / "you were selected" emails
  created_at: string;
  updated_at: string;
}

export interface Session {
  user_id: string;
  role: Role;
  admin_level: AdminLevel | null;
  created_at: string;
  expires_at: string;
  /** Set when an admin is impersonating this user. Null for normal sessions. */
  impersonator_id: string | null;
  impersonator_name?: string | null;
}

/** Authenticated request context, attached after session resolution. */
export interface AuthContext {
  user: UserRow;
  session: Session;
  sessionId: string;
}

export type NotificationJob =
  | { type: "task_posted"; task_id: string }
  | { type: "response_received"; task_id: string; response_id: string }
  | { type: "response_selected"; task_id: string; response_id: string }
  | { type: "magic_link"; email: string; link: string };
