# BidNeighbor.com — Product & Technical Spec (MVP)

> A local service-request marketplace. People post local tasks; nearby people and
> businesses respond with questions and quotes. Cloudflare-first.
> **Codename in early notes:** "NeighborTask." **Product/domain:** BidNeighbor.com.

- **Owner:** Kyle (kyle@steadycalls.com Cloudflare account)
- **Domain:** `bidneighbor.com` (owned, in the above Cloudflare account)
- **First market:** Sioux County, Iowa. Architecture must support multiple towns/counties later.
- **Status:** Greenfield. This spec is the source of truth for the MVP build.

---

## 1. Goals & Non-Goals

### Goal
A dead-simple local marketplace where:
- **Customers** post a task/job.
- **Providers** browse, ask questions, express interest, and submit optional quotes.
- **Admins** moderate users, jobs, quotes, and categories from a separate, locked-down surface.

Optimize for **older / non-technical users**. The main action on any screen must be
obvious within 3 seconds. Mobile-first. Plain UI, no clever animations.

### In scope (MVP)
Auth (magic link **+ Google**), user profiles, task posting with R2 file uploads,
provider responses/quotes, customer selection, email notifications via Queue,
category management, admin moderation **on a separate Zero-Trust-protected subdomain**,
admin **login-as-user (impersonation)**, Turnstile + rate limits + input sanitization,
**light/dark theme toggle (defaults to light, preference persisted)**.

### Explicitly NOT in MVP (future-ready, do not build yet)
Payments, escrow, transaction fees, complex bidding engine, reviews, verified-provider
badges, paid featured listings, business subscriptions, SMS notifications, in-app chat,
multi-county expansion dashboard, AI job-description cleanup, AI quote-range suggestions.
Schema and UI should leave room for these (e.g. `rating` / `verified` placeholders in
sort options) but ship none of the logic.

---

## 2. Architecture Overview

Cloudflare-first. A **single Worker** serves both hostnames and routes by `Host` header.
The frontend is **two SPA builds** (user app + admin app) served as static assets by the Worker.

```
                          bidneighbor.com (zone, Cloudflare DNS)
                                     │
        ┌────────────────────────────┴───────────────────────────┐
        │                                                          │
 app.bidneighbor.com                                   admin.bidneighbor.com
 (public — all users)                                  (Cloudflare Zero Trust / Access protected)
        │                                                          │
        └───────────────► one Cloudflare Worker ◄─────────────────┘
                          (routes by hostname)
                                     │
        ┌──────────────┬────────────┼────────────┬───────────────┐
       D1            R2            KV          Queues          Turnstile
   (relational)  (uploads)  (cache/rl/session) (notify async)  (anti-spam, verify in Worker)
                                     │
                              Transactional email
                          (Resend via Worker fetch)
```

### Why a single Worker, two hosts
- **Defense in depth on admin.** `admin.bidneighbor.com` sits behind **Cloudflare Access**
  (Zero Trust) — only authorized identities (Kyle + named admins) can even reach the origin.
  On top of that, admin API routes re-check `role` server-side. Two independent gates.
- Admin API routes are only mounted when `Host === admin.bidneighbor.com`. A request to
  `app.bidneighbor.com/api/admin/*` returns 404 — the admin surface does not exist on the public host.
- Simpler ops: one deploy, one D1, one secret set. (If admin traffic ever needs full
  isolation, the admin routes can be split into a second Worker with zero code change to the
  route handlers — they're already host-scoped.)

### Bindings (wrangler.toml)
| Binding | Type | Name | Purpose |
|---|---|---|---|
| `DB` | D1 | `bidneighbor` | All relational data |
| `TASK_UPLOADS` | R2 | `bidneighbor-uploads` | Task images/files |
| `RATE_LIMITS` | KV | `bidneighbor-kv` | Rate limits, sessions, short-lived cache |
| `NOTIFICATION_QUEUE` | Queue | `bidneighbor-notifications` | Async email/notification jobs |

Routes: `app.bidneighbor.com/*` and `admin.bidneighbor.com/*` both → this Worker.

---

## 3. Tech Stack Decisions

| Concern | Choice | Notes |
|---|---|---|
| Compute | Cloudflare Workers | Module worker, `fetch()` + `queue()` handlers |
| Frontend | **React 18 + Vite + TypeScript + Tailwind 3 + React Router** | Matches Kyle's other Cloudflare apps (gsd-kylr-app). Two builds: `app` and `admin`. |
| DB | Cloudflare D1 | Migrations in `cloud/d1/NNN_*.sql` |
| File storage | Cloudflare R2 | Worker-mediated upload (no public bucket) |
| Async jobs | Cloudflare Queues | Notification fan-out — **never `ctx.waitUntil` for email** |
| Anti-spam | Cloudflare Turnstile | Server-side token verification in Worker |
| Rate limit / session | Cloudflare KV | Sliding-window counters + session lookup |
| Email | **Resend** (HTTP API via Worker `fetch`) | Cloudflare Email Routing is inbound-only; MailChannels' free Workers route is gone. Resend is the clean transactional choice. `EMAIL_API_KEY` + `EMAIL_FROM`. |
| Realtime | **Not in MVP** | Durable Objects reserved for future chat/presence |

> **Next.js** was offered as an alternative. Decision: **React + Vite.** It is the
> simplest thing that deploys cleanly to a Worker as static assets and matches the
> existing house style. Revisit only if SSR/SEO on public task pages becomes a priority.

---

## 4. Authentication & Sessions

Three sign-in surfaces, two methods.

### Methods
1. **Email magic link** (passwordless).
   - `POST /api/auth/request-link` → Turnstile-gated, rate-limited. Generates a single-use,
     short-TTL (15 min) token, stores its hash in KV keyed by token id, emails the link
     via the notification queue.
   - `GET /api/auth/verify?token=...` → validates, consumes the token (delete from KV),
     creates/locates the user, issues a session, redirects into the app.
2. **Google OAuth (Sign in with Google).** *(Required addition.)*
   - Standard OAuth 2.0 Authorization Code flow, implemented directly in the Worker
     (no third-party auth SaaS).
   - `GET /api/auth/google/start` → builds Google consent URL with `state` (CSRF, stored in
     KV/cookie) and redirects.
   - `GET /api/auth/google/callback` → exchanges code for tokens, verifies the `id_token`
     (issuer, audience, expiry, signature against Google JWKS), extracts verified email +
     name, creates/locates the user by email, issues a session.
   - If a Google email matches an existing magic-link user, **link to the same account**
     (email is the identity key). Record `auth_provider` on the user for display.
   - Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`. Authorized redirect
     URIs: `https://app.bidneighbor.com/api/auth/google/callback` and the admin host.

### Sessions
- Opaque session id (random 32 bytes) stored in KV: `session:<id>` →
  `{ user_id, role, created_at, expires_at, impersonator_id|null }`. TTL 30 days, sliding.
- Delivered as an **`HttpOnly`, `Secure`, `SameSite=Lax` cookie**, scoped to the host.
  Cookie value is the session id, **signed with `SESSION_SIGNING_KEY`** (HMAC) so a tampered
  id is rejected before the KV lookup.
- `GET /api/me` returns the current user (and, if impersonating, the impersonation banner info).
- `POST /api/logout` deletes the KV session and clears the cookie.

### Roles
`customer` | `provider` | `admin` — stored on `users.role`.
Admin tiers (superadmin / admin / platform_manager) are represented by
`users.admin_level` (null for non-admins). See § Admin.

> A user can act as both customer and provider (post tasks *and* respond). `role` is the
> primary role for routing/labels; capability checks are **action-based**, not role-gated
> beyond the obvious (only admins reach admin routes; only the task owner edits their task).
> Choosing to "become a provider" sets `role='provider'` and unlocks the provider dashboard +
> category-notification preferences. Admin can change any role.

### Where each method is allowed
| Surface | Host | Methods | Extra gate |
|---|---|---|---|
| User app | `app.bidneighbor.com` | Magic link, Google | Turnstile on request-link form |
| Admin app | `admin.bidneighbor.com` | Magic link, Google — **but only `admin_level != null` users pass** | **Cloudflare Access** in front; server re-checks `admin_level` |

---

## 5. Admin Surface (admin.bidneighbor.com)

### Access model
1. **Cloudflare Zero Trust / Access policy** on `admin.bidneighbor.com` — an Access
   application with an allow policy listing the admin emails (and/or a Google group /
   service token for automation). Unauthenticated requests never reach the Worker.
2. **Server-side role check** — every `/api/admin/*` handler asserts the session user has
   `admin_level in ('superadmin','admin','platform_manager')`. Reject with 403 otherwise.
3. Admin routes are **only mounted on the admin host**. `app.bidneighbor.com/api/admin/*` = 404.

### Admin tiers
| Tier | `admin_level` | Capabilities |
|---|---|---|
| Super Admin | `superadmin` | Everything, incl. managing other admins, all destructive ops |
| Admin | `admin` | Moderate users/tasks/responses/categories, impersonate users |
| Platform Manager | `platform_manager` | Read + light moderation (hide spam, change task status); **cannot** manage admins or hard-delete |

(MVP can ship with all three recognized but only `superadmin`/`admin` granted; the gradation
is in the schema and checks so it's ready.)

### Login as user (impersonation) — *(required feature)*
Admins can "log in as" any user to reproduce issues and support them.

**Flow**
1. Admin (on admin host, passed Access + role check) clicks **"Log in as"** on a user row.
2. `POST /api/admin/users/:id/impersonate` →
   - Asserts admin permission (`admin` or `superadmin`).
   - Creates a **new session on the user app host** with
     `{ user_id: <target>, role: <target.role>, impersonator_id: <admin.id> }`, short TTL (e.g. 60 min).
   - Writes an `audit_log` row: `action='impersonate.start'`, actor = admin, target = user.
   - Returns a one-time redirect URL to `app.bidneighbor.com` that sets the impersonation cookie.
3. In the user app, `GET /api/me` reports `impersonating: { by_admin_id, by_admin_name }`,
   and the UI shows a **persistent banner**: *"You are signed in as {user} (admin impersonation) — Return to admin"*.
4. **"Return to admin"** → `POST /api/auth/stop-impersonation` deletes the impersonation
   session, writes `audit_log` `action='impersonate.stop'`, and bounces back to the admin host.

**Guardrails (mandatory)**
- Every mutating request carried out under an impersonation session is **audit-logged with
  both `actor_user_id` (target) and `impersonator_id` (admin)**.
- An impersonation session **cannot reach the admin host** (it has no `admin_level`; and
  Access would block it anyway).
- Impersonation sessions are **blocked from irreversible actions** by default (e.g. deleting
  the user's account, changing the user's email/login). Configurable; default deny.
- Only `admin`/`superadmin` may impersonate. `platform_manager` may not.
- Impersonation TTL is short; banner is non-dismissible.

### Admin dashboard features (MVP)
- **Users:** list/search, view profile, change role, suspend/unsuspend, **Log in as**.
- **Tasks:** list/filter, view, change status, hide/remove spam.
- **Responses:** view, hide spam.
- **Categories:** create/rename/deactivate (also exposed via `POST /api/admin/categories`).
- **Flags/queue:** view `admin_flags` (reported entities), resolve.
- **Audit log:** read-only view of admin actions + impersonation events.

---

## 6. Data Model (D1)

All ids are text (UUID v4 / ULID). All timestamps are ISO-8601 text (UTC). Money is integer **cents**.

> Tables below extend the original draft with the fields the new requirements need
> (`role`/`admin_level`, `auth_provider`, theme preference, suspension, audit log,
> sessions are in KV not D1). Additive columns are called out.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `email` | text UNIQUE NOT NULL | identity key (magic link + Google link to this) |
| `name` | text | |
| `phone` | text | optional, **never exposed publicly** |
| `role` | text NOT NULL DEFAULT `'customer'` | `customer`\|`provider`\|`admin` |
| `admin_level` | text | `superadmin`\|`admin`\|`platform_manager`\|NULL — *added for admin tiers* |
| `auth_provider` | text | `magic_link`\|`google` (last used) — *added* |
| `town` | text | |
| `county` | text | |
| `provider_bio` | text | optional |
| `theme_preference` | text DEFAULT `'light'` | `light`\|`dark` — *added; persists UI theme* |
| `status` | text NOT NULL DEFAULT `'active'` | `active`\|`suspended` — *added for moderation* |
| `created_at` | text NOT NULL | |
| `updated_at` | text NOT NULL | |

### `categories`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `name` | text NOT NULL | |
| `slug` | text UNIQUE NOT NULL | |
| `is_active` | integer NOT NULL DEFAULT 1 | *added — deactivate without delete* |
| `created_at` | text NOT NULL | |

### `user_categories` (provider notification subscriptions)
| Column | Type | Notes |
|---|---|---|
| `user_id` | text NOT NULL | |
| `category_id` | text NOT NULL | |
| PK | (`user_id`,`category_id`) | |

### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `customer_id` | text NOT NULL | FK users.id |
| `title` | text NOT NULL | |
| `description` | text NOT NULL | sanitized |
| `category_id` | text NOT NULL | FK categories.id |
| `town` | text | |
| `county` | text | matching key for notifications |
| `location_note` | text | approximate area only — **no exact address public** |
| `budget_cents` | integer | optional |
| `timeframe` | text | e.g. "ASAP", "This week", "Flexible" |
| `status` | text NOT NULL DEFAULT `'open'` | `open`\|`assigned`\|`completed`\|`cancelled`\|`hidden` (*hidden = admin moderation*) |
| `selected_response_id` | text | FK responses.id |
| `created_at` | text NOT NULL | |
| `updated_at` | text NOT NULL | |

Indexes: `(status, county, category_id)` for the task board + notification matching;
`(customer_id)` for "my tasks".

### `task_files`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `task_id` | text NOT NULL | FK tasks.id |
| `r2_key` | text NOT NULL | object key in TASK_UPLOADS |
| `filename` | text | original name |
| `content_type` | text | validated (images + PDF only) |
| `size_bytes` | integer | *added — enforce size cap* |
| `created_at` | text NOT NULL | |

### `responses`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `task_id` | text NOT NULL | FK tasks.id |
| `provider_id` | text NOT NULL | FK users.id |
| `message` | text NOT NULL | sanitized |
| `quote_cents` | integer | optional |
| `status` | text NOT NULL DEFAULT `'active'` | `active`\|`withdrawn`\|`hidden` |
| `created_at` | text NOT NULL | |
| `updated_at` | text NOT NULL | |

Constraint: **one active response per (task_id, provider_id)** — enforce with a partial unique
index `CREATE UNIQUE INDEX ... ON responses(task_id, provider_id) WHERE status='active'`.

### `notifications`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `user_id` | text | recipient |
| `type` | text NOT NULL | `task_posted`\|`response_received`\|`response_selected`\|`magic_link` |
| `payload_json` | text NOT NULL | render data |
| `status` | text NOT NULL DEFAULT `'queued'` | `queued`\|`sent`\|`failed` |
| `created_at` | text NOT NULL | |
| `sent_at` | text | |

### `admin_flags`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `entity_type` | text NOT NULL | `task`\|`response`\|`user` |
| `entity_id` | text NOT NULL | |
| `reason` | text | |
| `status` | text NOT NULL DEFAULT `'open'` | `open`\|`resolved` — *added* |
| `created_at` | text NOT NULL | |

### `audit_log` *(added — admin + impersonation accountability)*
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `actor_user_id` | text | who performed it (the impersonated user, if impersonating) |
| `impersonator_id` | text | admin id when action done under impersonation, else NULL |
| `action` | text NOT NULL | e.g. `impersonate.start`, `task.hide`, `user.role_change` |
| `entity_type` | text | |
| `entity_id` | text | |
| `meta_json` | text | before/after, request ip, etc. |
| `created_at` | text NOT NULL | |

> Sessions live in **KV**, not D1 (`session:<id>`, `magiclink:<id>`, `oauthstate:<id>`,
> `ratelimit:<bucket>`). D1 is for durable relational data only.

---

## 7. API Routes

JSON over HTTPS. All mutations require a valid session and **server-side authorization**.
`:host` column = which hostname the route is mounted on.

### Auth (app host)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/request-link` | public | Turnstile + rate limit; enqueues magic-link email |
| GET | `/api/auth/verify` | public | consumes token, starts session, redirects |
| GET | `/api/auth/google/start` | public | OAuth redirect (sets `state`) |
| GET | `/api/auth/google/callback` | public | verifies id_token, starts session |
| POST | `/api/logout` | session | clears session |
| GET | `/api/me` | session | current user + impersonation info |
| POST | `/api/auth/stop-impersonation` | impersonation session | ends impersonation, returns to admin |

### Categories
| Method | Path | Auth |
|---|---|---|
| GET | `/api/categories` | public |
| POST | `/api/admin/categories` | admin (admin host) |
| PATCH | `/api/admin/categories/:id` | admin (admin host) |

### Tasks
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/tasks` | public | filters: `category`,`town`,`county`,`timeframe`; only `status='open'`; public-safe fields only |
| POST | `/api/tasks` | session (customer) | Turnstile + rate limit; sanitize; enqueue `task_posted` |
| GET | `/api/tasks/:id` | public | public view hides customer email/phone |
| PATCH | `/api/tasks/:id` | session — **owner only** | edit/close/cancel |
| POST | `/api/tasks/:id/files` | session — owner only | Worker-mediated R2 upload; validate type/size |
| POST | `/api/tasks/:id/responses` | session (provider) | one active per provider; enqueue `response_received` |
| GET | `/api/tasks/:id/responses` | session — **owner or responding provider** | owner sees all; provider sees own |
| POST | `/api/tasks/:id/select-response` | session — owner only | sets `selected_response_id`, status→`assigned`; enqueue `response_selected` |

### Provider
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/provider/tasks` | session (provider) | matching jobs: same county + subscribed categories |
| GET | `/api/provider/responses` | session (provider) | this provider's responses |
| PATCH | `/api/responses/:id` | session — **author provider only** | update / withdraw |
| GET / PUT | `/api/provider/categories` | session (provider) | manage notification subscriptions |

### Admin (admin host only — behind Access + role check)
| Method | Path |
|---|---|
| GET | `/api/admin/tasks` |
| PATCH | `/api/admin/tasks/:id` (status / hide / remove) |
| GET | `/api/admin/users` |
| PATCH | `/api/admin/users/:id` (role, admin_level, suspend) |
| POST | `/api/admin/users/:id/impersonate` |
| GET | `/api/admin/flags` / PATCH `/api/admin/flags/:id` |
| GET | `/api/admin/audit-log` |

### Health
| Method | Path | Notes |
|---|---|---|
| GET | `/api/_health` | `{ status, sha, deployed_at }` — deploy provenance |

---

## 8. Pages (frontend)

### User app (`app.bidneighbor.com`)
| Route | Purpose |
|---|---|
| `/` | Homepage — value prop, CTAs, category cards |
| `/login` | Magic link + **Continue with Google** |
| `/post-task` | Task form + R2 image upload + Turnstile |
| `/tasks` | Task board — list + filters (category/town/county); hides exact location |
| `/tasks/:id` | Task detail — public-safe; owner sees responses + select; provider sees respond form |
| `/my-tasks` | Customer's posted tasks + their responses |
| `/provider` | Provider dashboard — matching jobs, recent open jobs, my responses |
| `/provider/profile` | Bio, town/county, category notification subscriptions |

**Homepage copy:** "Post a local job. Get responses from nearby people and businesses."
CTAs: **Post a task** / **Browse local jobs**. Category cards below.

**Task board cards** show: title, category, town, timeframe, budget (if present), date posted.
Never the exact address or any contact info.

**Post-task flow:** simple form → image upload to R2 → Turnstile → confirmation screen with a
shareable task link.

### Admin app (`admin.bidneighbor.com`)
| Route | Purpose |
|---|---|
| `/` | Admin dashboard — counts, recent flags, quick links |
| `/users` | User table — search, role, suspend, **Log in as** |
| `/tasks` | Task moderation — filter, change status, hide/remove |
| `/responses` | Response moderation |
| `/categories` | Category CRUD |
| `/flags` | Moderation queue |
| `/audit` | Audit log viewer |

---

## 9. Theme: Light / Dark (required addition)

- A theme toggle is available in the app header (user app and admin app).
- **Default is light** (white). On first paint, before React hydrates, an inline
  `<head>` script reads `localStorage.theme` (falling back to `'light'` — *not* the OS
  `prefers-color-scheme*, to honor "default to white"*) and sets `class="dark"` on `<html>`
  to avoid a flash.
- Implemented with **Tailwind `darkMode: 'class'`**.
- Persistence is **two-tier**:
  1. `localStorage.theme` for instant, no-auth-needed application (works on the public
     homepage before login).
  2. For logged-in users, `users.theme_preference` is the durable source of truth — on
     login, `GET /api/me` returns it and the client reconciles localStorage to match, so
     the preference follows the user across devices. Toggling while logged in PATCHes the
     preference (debounced) and updates localStorage.
- No system/auto mode in MVP (keep it to two explicit choices for non-technical users).

---

## 10. Notifications (Cloudflare Queues)

**Never send email inside `ctx.waitUntil`** (30s cap, silent cancellation). All email goes
through the Queue.

**Producers** enqueue a job after the DB write commits:
- Task posted → `{ type: 'task_posted', task_id }`
- Provider responds → `{ type: 'response_received', task_id, response_id }`
- Response selected → `{ type: 'response_selected', task_id, response_id }`
- Magic link / Google n/a → magic link email is also enqueued: `{ type: 'magic_link', email, link }`

**Consumer** (`queue()` handler) per message:
1. `task_posted`: find matching providers — **`users` with `county = task.county` AND a
   `user_categories` row for `task.category_id`, `status='active'`**. Insert `notifications`
   rows, send one email each via Resend. (Batch; respect Resend rate limits; retry on failure
   — Queues gives at-least-once + retries.)
2. `response_received`: email the task's customer.
3. `response_selected`: email the selected provider.
4. Mark `notifications.status='sent'` + `sent_at`, or `'failed'` to let Queue retry.

Matching rule (MVP): **same county + matching category**. Town is a display/filter field, not
a match key (keeps notifications useful in a small rural county). Future: per-provider radius.

---

## 11. Security

| Area | Requirement |
|---|---|
| PII exposure | Public task pages/board **never** include customer email or phone. API serializers strip them. |
| Uploads | **Worker-mediated** (no public R2). Validate **content-type allowlist (images + PDF)** and **size cap** (e.g. ≤ 10 MB, ≤ 5 files/task). Re-check magic bytes, not just the declared MIME. Generate random R2 keys; serve via a Worker route with auth where needed. |
| Spam | Turnstile on `request-link` and `post-task` (and response submit). Verify token server-side against `TURNSTILE_SECRET_KEY`. |
| Rate limits | KV sliding-window per IP and per user on: login requests, task posts, responses. e.g. login 5/15min/IP; task post 10/day/user. Return 429 with retry-after. |
| Authorization | Server-side on **every** mutation. Owner-only edits; provider-only responses; admin-only admin routes. Never trust client role. |
| Admin isolation | Cloudflare Access on `admin.bidneighbor.com` **plus** server role check **plus** host-scoped route mounting. |
| Impersonation | Audit-logged (actor + impersonator); short TTL; cannot reach admin host; destructive actions blocked. |
| Sanitization | Sanitize all user text on input and escape on output. Treat description/message/bio as untrusted; render as text, not HTML. |
| Sessions | Signed, `HttpOnly`/`Secure`/`SameSite=Lax` cookies; opaque ids in KV; rotate on privilege change. |
| OAuth | Verify Google `id_token` signature/iss/aud/exp; CSRF `state`; only accept verified emails. |
| Secrets | Worker secrets via `wrangler secret put`; never in repo. `.env`/`env` gitignored (done). |

---

## 12. Environment & Bindings

### wrangler.toml (shape)
```toml
name = "bidneighbor"
main = "worker/src/index.ts"
compatibility_date = "2026-06-01"

[[d1_databases]]
binding = "DB"
database_name = "bidneighbor"
database_id = "<filled after create>"
migrations_dir = "d1"

[[r2_buckets]]
binding = "TASK_UPLOADS"
bucket_name = "bidneighbor-uploads"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "<filled after create>"

[[queues.producers]]
binding = "NOTIFICATION_QUEUE"
queue = "bidneighbor-notifications"

[[queues.consumers]]
queue = "bidneighbor-notifications"
max_batch_size = 10
max_retries = 3

[[routes]]
pattern = "app.bidneighbor.com/*"
zone_name = "bidneighbor.com"

[[routes]]
pattern = "admin.bidneighbor.com/*"
zone_name = "bidneighbor.com"

[vars]
APP_BASE_URL = "https://app.bidneighbor.com"
ADMIN_BASE_URL = "https://admin.bidneighbor.com"
EMAIL_FROM = "no-reply@bidneighbor.com"
```

### Secrets (`wrangler secret put`)
`TURNSTILE_SECRET_KEY`, `EMAIL_API_KEY` (Resend), `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `SESSION_SIGNING_KEY`.

### Local tooling `.env`
Already present (gitignored). Holds Cloudflare account id + API token, GitHub token, and AI
keys for local scripts. Runtime secrets above are **not** read from `.env` by the Worker — they
come from `wrangler secret`/`.dev.vars` locally.

---

## 13. Seed Data

**Categories** (slugify each): Lawn Care, Snow Removal, Junk Hauling, Handyman, Painting,
Drywall, Cleaning, Small Engine Repair, Auto Help, Moving Help, Landscaping, Tree Work,
Concrete, Farm Help, Miscellaneous.

**Default market:** County = **Sioux County**. Towns = Hull, Sioux Center, Orange City,
Rock Valley, Boyden, Hospers, Alton, Ireton, Maurice, Hawarden.

> Towns/counties seed a `geo` reference (could be a static TS constant in MVP rather than a
> table) so the multi-county future just adds rows. Seed script: `cloud/d1/seed.sql` (or a
> `npm run seed` wrangler exec). Also seed the first **superadmin** (Kyle's email,
> `admin_level='superadmin'`).

---

## 14. Implementation Order

1. Scaffold Worker (TS) + Vite React app(s) + Tailwind (dark mode class). Wire `/api/_health`.
2. wrangler.toml bindings; create D1/KV/R2/Queue; first migration + seed.
3. Auth: magic link, **then Google OAuth**, sessions in KV, `/api/me`, `/logout`.
4. Categories + Task CRUD (post, board, detail, my-tasks). R2 upload.
5. Provider responses + category subscriptions + provider dashboard.
6. Notification Queue (producers + consumer + Resend).
7. Admin app on admin host: Access policy, role checks, moderation, **impersonation**, audit log.
8. Turnstile + KV rate limits + sanitization + upload validation.
9. Theme toggle (light default, persisted).
10. Mobile polish; accessibility for older users (large tap targets, high contrast, plain copy).

---

## 15. Business Logic (rules)

- Tasks are public only when `status='open'` (and not `hidden`).
- Only the task owner can edit/close/cancel their task.
- Only providers can respond; one **active** response per provider per task.
- Customer can select exactly one response (→ task `assigned`).
- Admin can hide/close/remove any task or response.
- Providers choose which categories they get notified for (`user_categories`).
- Notification match = same county + subscribed category.
- Suspended users cannot post or respond (read-only).

---

## 16. Deliverables & Acceptance

### Deliverables
- Working codebase (Worker + two SPAs).
- Cloudflare deploy config (`wrangler.toml`, GitHub Actions CI + deploy).
- D1 migration files + seed script.
- README: setup, local dev (`wrangler dev`), production deploy, Cloudflare Access setup for
  admin host, Google OAuth app setup, Resend setup.
- Basic tests (Vitest): auth (magic link issue/consume, Google callback verify), task
  creation, response creation, **authorization** (owner-only, provider-only, admin-only,
  impersonation guardrails).

### Acceptance criteria
- [ ] Customer signs in (magic link **or Google**), posts a task, uploads an image, sees it on the board.
- [ ] Provider signs in, picks categories, sees matching tasks, responds.
- [ ] Customer is emailed when a provider responds.
- [ ] Matching providers are emailed when a task is posted (same county + category).
- [ ] Selected provider is emailed on selection.
- [ ] Admin (via `admin.bidneighbor.com`, behind Access) moderates users and tasks.
- [ ] Admin can **"Log in as" a user**, the impersonation banner shows, actions are audit-logged, and "Return to admin" works.
- [ ] Theme toggle works, defaults to light, and the preference persists (localStorage + per-user).
- [ ] App deploys cleanly to Cloudflare via GitHub Actions; `/api/_health` returns the deployed SHA.

---

## 17. Future-Ready (do NOT build yet)
Reviews · verified providers · paid featured listings · business subscriptions · SMS ·
in-app chat (Durable Objects) · payments · escrow · transaction fees · complex bidding ·
multi-county expansion dashboard · AI job-description cleanup · AI quote-range suggestions.
Leave schema/UI seams (rating/verified placeholders, county as a first-class dimension,
`auth_provider` field, queue-based notifications already abstracted) so these slot in cleanly.

---

## 18. Open Questions for Owner
1. **Email sender domain** — confirm `no-reply@bidneighbor.com` and set up Resend domain
   verification (SPF/DKIM on the `bidneighbor.com` zone). OK to use Resend, or prefer another
   provider (Postmark/Mailgun)?
2. **Admin identities** — which emails get `superadmin` vs `admin` vs `platform_manager`, and
   should the Cloudflare Access policy use individual emails or a Google group?
3. **Provider verification at signup** — MVP lets anyone self-select provider. Acceptable, or
   gate provider status behind admin approval from day one?
4. **GitHub repo** — name/visibility for the repo under `kroelofs` (CI/deploy assume a repo + secrets).
