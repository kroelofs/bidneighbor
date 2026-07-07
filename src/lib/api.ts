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
  notify_messages: number; // 0|1
  last_mode: "neighbor" | "provider" | null;
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
  del: <T>(p: string) => req<T>("DELETE", p),
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
  selected_response_id?: string | null;
  created_at: string;
  slug: string;
  share_url: string;
}

// ---- Private conversations ----
export interface ConversationSummary {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string | null;
  other_party: { name: string | null };
  last_message_at: string | null;
  unread: number;
}
export interface MessageFile {
  id: string;
  content_type: string;
}
export interface Message {
  id: string;
  sender_id: string;
  mine: boolean;
  body: string;
  files: MessageFile[];
  created_at: string;
}

/** URL to stream a private message attachment (participants only, server-authorized). */
export function messageFileUrl(conversationId: string, fileId: string): string {
  return `/api/conversations/${conversationId}/files/${fileId}`;
}

/** Send an image (with an optional caption) as a message. */
export async function sendMessageImage(conversationId: string, file: File, caption?: string): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("body", caption);
  await api.upload(`/api/conversations/${conversationId}/files`, form);
}
export interface ThreadContext {
  message: string;
  quote_cents: number | null;
  created_at: string;
}
export interface ThreadView {
  conversation: { id: string; subject_type: string; subject_id: string; subject_title: string | null; owner_id: string; initiator_id: string };
  context: ThreadContext | null;
  messages: Message[];
}

/** Open (or reuse) a thread and return its id. `withUserId` is required only when the caller owns the subject. */
export async function openConversation(subjectType: string, subjectId: string, withUserId?: string): Promise<string> {
  const d = await api.post<{ id: string }>("/api/conversations", {
    subject_type: subjectType,
    subject_id: subjectId,
    ...(withUserId ? { with_user_id: withUserId } : {}),
  });
  return d.id;
}

// ---- Neighborhood Resources (equipment rentals) ----
export interface ResourceOwner { id: string; name: string | null; town: string | null; county: string | null; provider_bio: string | null }
export interface Resource {
  id: string;
  title: string;
  description: string;
  category_id: string | null;
  daily_rate_cents: number | null;
  deposit_cents: number | null;
  town: string | null;
  county: string | null;
  status: string;
  created_at: string;
  cover_file_id?: string | null;
  owner?: ResourceOwner;
}
export interface ResourceDetail extends Resource {
  moderation_state: string;
  is_owner: boolean;
  files: { id: string; content_type: string }[];
}

/** Public URL for a listing photo. */
export function resourceFileUrl(resourceId: string, fileId: string): string {
  return `/api/resources/${resourceId}/files/${fileId}`;
}

export function money(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
