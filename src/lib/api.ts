// Thin fetch wrapper. Cookies carry the session, so always include credentials.

export interface Me {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: "customer" | "provider" | "admin";
  admin_level: "superadmin" | "admin" | "platform_manager" | null;
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
  notify_new_tasks: number; // 0|1
  notify_responses: number; // 0|1
}

export interface MeResponse {
  user: Me | null;
  impersonating?: { by_admin_id: string; by_admin_name: string | null } | null;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
  put: <T>(p: string, b?: unknown) => req<T>("PUT", p, b),
  upload: <T>(p: string, form: FormData) => req<T>("POST", p, form),
  me: () => req<MeResponse>("GET", "/api/me"),
};

export interface Category { id: string; name: string; slug: string }
export interface Task {
  id: string;
  title: string;
  description: string;
  category_id: string;
  category_name: string | null;
  town: string | null;
  county: string | null;
  location_note: string | null;
  budget_cents: number | null;
  timeframe: string | null;
  status: string;
  created_at: string;
  slug: string;
  share_url: string;
}

export function money(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
