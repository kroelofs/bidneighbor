# BidNeighbor.com

A local service-request marketplace — people post local tasks/jobs, nearby providers respond
with questions and quotes. Cloudflare-first. First market: **Sioux County, Iowa**.

- **User app:** `app.bidneighbor.com` (customers + providers)
- **Admin app:** `admin.bidneighbor.com` (behind Cloudflare Zero Trust Access)

Full product/technical spec: [`SPEC.md`](SPEC.md). Contributor rules: [`CLAUDE.md`](CLAUDE.md).

## Stack
Cloudflare Workers · D1 · R2 · KV · Queues · Turnstile · React 18 + Vite + TypeScript + Tailwind 3.
One Worker serves both hostnames and routes by `Host`; the frontend builds two SPAs
(`index.html` user app, `admin.html` admin app) served as static assets.

## Layout
```
src/                  frontend — user SPA (src/pages) + admin SPA (src/admin)
  lib/                api client, theme, geo, session hook
  components/         Layout, ThemeToggle, ImpersonationBanner
cloud/
  wrangler.toml       worker config (D1/R2/KV/Queue/assets/routes)
  worker/src/         Worker: index.ts (fetch+queue), router.ts, routes/, lib/
  d1/                 migrations (0001_init.sql) + seed.sql
  public/             built assets (generated; gitignored)
tests/                vitest unit tests
.github/workflows/    ci.yml (PRs) + deploy.yml (merge to main)
```

## Local development

### 1. Install
```bash
npm install
```

### 2. Configure local secrets
```bash
cp cloud/.dev.vars.example cloud/.dev.vars   # then fill in (or leave blank for dev no-ops)
```
With blank secrets, dev still works: magic-link emails print to the console, Turnstile passes,
Google sign-in returns 503. Add the Resend key (`EMAIL_API_KEY`) to actually send email.

### 3. Create local D1 + apply schema + seed
```bash
npx wrangler d1 migrations apply bidneighbor --local --config cloud/wrangler.toml
npm run seed:local
```

### 4. Run
```bash
npm run dev:cloud   # Worker + assets at http://127.0.0.1:8787  (terminal A)
npm run dev:web     # Vite dev server at http://localhost:5173, proxies /api → :8787 (terminal B)
```
Open http://localhost:5173. To sign in locally, submit your email on `/login`, then copy the
magic-link URL printed in terminal A and open it.

### Typecheck / build / test
```bash
npm run typecheck   # frontend + worker, zero errors required
npm run build       # vite → cloud/public
npm test            # vitest
```

## First-time Cloudflare setup (one-time)

> Account: `kyle@steadycalls.com`. Run these once, then commit the real ids into
> `cloud/wrangler.toml` (replace the placeholder ids).

```bash
# D1
npx wrangler d1 create bidneighbor                       # -> paste database_id into wrangler.toml
# KV
npx wrangler kv namespace create RATE_LIMITS             # -> paste id into wrangler.toml
# R2
npx wrangler r2 bucket create bidneighbor-uploads
# Queue
npx wrangler queues create bidneighbor-notifications

# Apply schema + seed to remote
npx wrangler d1 migrations apply bidneighbor --remote --config cloud/wrangler.toml
npm run seed:remote

# Runtime secrets (production)
npx wrangler secret put TURNSTILE_SECRET_KEY --config cloud/wrangler.toml
npx wrangler secret put EMAIL_API_KEY --config cloud/wrangler.toml          # Resend
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID --config cloud/wrangler.toml
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --config cloud/wrangler.toml
npx wrangler secret put SESSION_SIGNING_KEY --config cloud/wrangler.toml    # random 32+ bytes
```

### DNS + routes
1. In the `bidneighbor.com` zone, add proxied (orange-cloud) records for `app` and `admin`.
2. Uncomment the `[[routes]]` blocks in `cloud/wrangler.toml`.

### Cloudflare Access (admin gate)
1. Zero Trust → Access → Applications → add a self-hosted app for `admin.bidneighbor.com`.
2. Allow policy: the admin emails (or a Google group). Optionally add a service token for automation.
3. The Worker **also** re-checks `admin_level` server-side — Access is the network gate, not the only gate.

### Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URIs:
   `https://app.bidneighbor.com/api/auth/google/callback`,
   `https://admin.bidneighbor.com/api/auth/google/callback`,
   and for local: `http://127.0.0.1:8787/api/auth/google/callback`.

### Resend (email)
1. Create a Resend account, verify the `bidneighbor.com` domain (SPF/DKIM on the zone).
2. Set `EMAIL_FROM` (wrangler.toml var) to a verified address, e.g. `no-reply@bidneighbor.com`.

## Production deploy
Deployment is **automated** — never run `wrangler deploy` by hand.
1. Branch, commit, push, open a PR (`gh pr create`). CI runs typecheck + build + tests.
2. Merge to `main` → `.github/workflows/deploy.yml` applies pending D1 migrations and deploys.
3. Requires the `CLOUDFLARE_API_TOKEN` GitHub repo secret (Workers + D1 + R2 + Queues edit, and
   Workers Routes edit on the `bidneighbor.com` zone).
4. Verify: `curl -s https://app.bidneighbor.com/api/_health | jq -r .sha` should equal the merged SHA.

## Security notes
- Public task pages never expose customer email/phone (serializers strip them).
- Uploads are Worker-mediated, type+magic-byte+size validated (JPG/PNG/WebP/PDF, ≤10 MB, ≤5/task).
- Turnstile on login + post forms; KV rate limits on login and posting.
- Sessions are signed HttpOnly cookies; ids live in KV.
- Admin = Cloudflare Access **+** server role check **+** host-scoped routes.
- Impersonation ("Log in as") is audit-logged with both the admin and the target user.

## Status
MVP scaffold. Core flows implemented; Turnstile widget rendering, a dedicated `/api/my-tasks`
endpoint, and JWKS-based Google id_token verification are noted follow-ups. See `SPEC.md` §17 for
the deliberately-deferred feature list.
