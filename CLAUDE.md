# BidNeighbor.com

A local service-request marketplace — people post local tasks/jobs, nearby providers
respond with questions and quotes. Cloudflare-first. First market: **Sioux County, Iowa**;
architecture supports multiple towns/counties later.

- **User app:** `app.bidneighbor.com` (customers + providers)
- **Admin app:** `admin.bidneighbor.com` (superadmin / admin / platform manager — Cloudflare Zero Trust Access protected)
- **Cloudflare account:** kyle@steadycalls.com

Full product/technical spec: [`SPEC.md`](SPEC.md). Read it before building features.

## Stack
- **Cloud**: Cloudflare Workers, D1 (SQLite at edge), KV, R2, Queues, Turnstile, wrangler CLI
- **Frontend**: React 18 + Vite + TypeScript, Tailwind CSS 3, React Router
- **Repo**: GitHub (owner `kroelofs`). Default branch: `main`.

## Architecture
```
src/              — frontend (React, Tailwind, lazy-loaded pages); user + admin SPAs
cloud/
  wrangler.toml   — worker config: D1 (DB), KV (RATE_LIMITS), R2 (TASK_UPLOADS),
                    Queue (NOTIFICATION_QUEUE), routes (app + admin hosts), secrets
  worker/src/
    index.ts      — fetch() router (routes by hostname) + queue() consumer
    routes/       — API handlers (auth, tasks, responses, categories, admin, files)
    lib/          — auth/session, email, turnstile, rate-limit, r2, response helpers
    types.ts      — Env (bindings + secrets) interface
  public/         — built frontend assets (output of `npm run build`; gitignored)
  d1/             — D1 migration files (NNN_description.sql)
docs/             — specs + planning docs
```

## Build & Deploy

### DEPLOYMENT RULES — MANDATORY
1. **NEVER push directly to `main`.** All changes go through a pull request.
2. **NEVER run `wrangler deploy` manually.** Deployment is handled by GitHub Actions on merge to `main`.
3. **ALWAYS create a feature branch**, commit, push, and open a PR with `gh pr create`.
4. CI (`.github/workflows/ci.yml`) runs automatically on the PR — typecheck + build + tests. Only merge when green.
5. Merging to `main` triggers `.github/workflows/deploy.yml`, which re-verifies, applies pending D1 migrations, and deploys to Cloudflare. **Merge *is* deploy.**

### Day-to-day flow
> **Use a git worktree for any non-trivial / multi-file feature** (new pages + routes + migrations,
> integrations, refactors). Develop in an isolated worktree so `main` and other in-flight branches stay
> clean and never collide:
> ```bash
> git worktree add ../bidneighbor-<feature> -b feat/<feature>
> # work, commit, push, open PR from inside the worktree, then:
> git worktree remove ../bidneighbor-<feature>
> ```
> Small single-file tweaks can skip this and use a plain branch below.

```bash
# 1. Branch — never commit on main
git checkout -b feat/my-change

# 2. Run the SAME checks CI runs, locally, first (zero errors required):
npx tsc --noEmit        # root tsconfig covers src/ AND cloud/worker/src
npm run build           # vite build → cloud/public
npm test                # vitest

# 3. Commit, push, open PR
git add <files>
git commit -m "feat: description"
git push -u origin feat/my-change
gh pr create --title "feat: description" --body "Summary"

# 4. Watch CI, merge once green
gh pr checks <PR> --watch --fail-fast
gh pr merge <PR> --merge

# 5. Verify the RIGHT artifact shipped:
curl -s https://app.bidneighbor.com/api/_health | jq -r .sha   # should equal merged commit SHA
```

### Secrets
- **`CLOUDFLARE_API_TOKEN`** — GitHub repo secret used by the deploy workflow. Needs
  **Account → Workers Scripts:Edit + D1:Edit + Queues:Edit + R2:Edit**, and **Zone → Workers Routes:Edit**
  with the `bidneighbor.com` zone in scope (routes bind `app.bidneighbor.com/*` and `admin.bidneighbor.com/*`).
- **Worker runtime secrets** (`TURNSTILE_SECRET_KEY`, `EMAIL_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`,
  `SESSION_SIGNING_KEY`, …) are set with `wrangler secret put`, **NOT** as GitHub secrets. See [`SPEC.md`](SPEC.md) § Environment.

### D1 Migrations
Drop a new `NNN_description.sql` in `cloud/d1/` and ship it in the PR — the deploy workflow applies it
automatically (tracked in the migrations table; only unrun migrations execute). **One bad migration blocks
all deploys** until fixed.
```bash
# Check live schema:
cd cloud && npx wrangler d1 execute bidneighbor --remote \
  --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='TABLE_NAME'"
```

## TypeScript Checks — Run Before Every Build
```bash
npx tsc --noEmit    # root tsconfig includes src/ AND cloud/worker/src — one pass covers both
```
**Zero errors required.** Vite silently excludes modules that fail type resolution, causing blank pages with no console errors.

## Common Pitfalls
1. **Blank page after a change** — a TypeScript error. Run `npx tsc --noEmit`.
2. **Stale Vite cache** — `rm -rf cloud/public node_modules/.vite`, then rebuild.
3. **`ctx.waitUntil()` has a ~30s hard limit** after the response is sent. Long work (email fan-out,
   notification matching) placed there is silently cancelled. Use the **Queue consumer** instead — that's
   what `NOTIFICATION_QUEUE` is for.
4. **D1 schema drift** — local migrations and remote D1 can diverge. Migrations that recreate tables can drop
   columns; preserve all columns in `INSERT...SELECT`.
5. **Admin surface defense-in-depth** — admin API routes are gated BOTH by Cloudflare Access (network, on the
   `admin.bidneighbor.com` host) AND by server-side role checks. Never rely on only one. See [`SPEC.md`](SPEC.md) § Auth.
6. **Impersonation ("login as user")** — every action under impersonation must be audit-logged with both the
   real admin id and the target user id. Impersonation sessions cannot reach the admin host. See [`SPEC.md`](SPEC.md) § Admin.

## Deploy provenance
`GET /api/_health` → `{ status, sha, deployed_at }`. Compare `.sha` to the merged commit to confirm the exact
artifact is serving (Cloudflare occasionally has cache/version skew where the gate is up but new code hasn't propagated).
