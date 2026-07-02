import type { Env, NotificationJob } from "./types";
import { routeApi } from "./router";
import { resolveSession } from "./lib/session";
import { handleQueue } from "./queue";
import { handleScheduled } from "./cron";
import { injectTaskOg } from "./lib/og";
import { isCountryAllowed, geoBlockResponse } from "./lib/geogate";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const host = (req.headers.get("host") || url.host).toLowerCase();

    // Canonical host: bare domain + www → the app host. Keeps one cookie domain and
    // one set of OAuth redirect URIs. 302 (not 301) while iterating.
    if (host === "bidneighbor.com" || host === "www.bidneighbor.com") {
      return Response.redirect(`${env.APP_BASE_URL}${url.pathname}${url.search}`, 302);
    }

    // Legacy admin host → the app host. Admin is now a route inside the single app
    // SPA (app.bidneighbor.com/admin), so old admin.* bookmarks/deep links redirect
    // here. "/" lands on the admin dashboard; deeper paths (e.g. /users) are kept.
    if (host === env.ADMIN_HOST || host.startsWith("admin.")) {
      const dest = url.pathname === "/" ? "/admin" : url.pathname;
      return Response.redirect(`${env.APP_BASE_URL}${dest}${url.search}`, 302);
    }

    // ---- US-only geo gate (app product surface only) ----
    // The app host is United-States-only, but the admin surface stays open for
    // travelling admins and /api/_health stays open for uptime monitors. Fail-open
    // on unknown country (e.g. local dev). See lib/geogate.ts.
    const isAdminSurface = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    if (url.pathname !== "/api/_health" && !isAdminSurface && !isCountryAllowed(req)) {
      return geoBlockResponse();
    }

    // ---- API ----
    if (url.pathname.startsWith("/api/")) {
      const auth = await resolveSession(req, env);
      const res = await routeApi({ req, env, auth });
      if (res) return res;
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- Static assets + SPA shell ----
    // Real files (have an extension, e.g. /assets/app-abc.js) come from ASSETS.
    // Everything else is a client-side route and gets the single SPA shell
    // (index.html); the app's React Router renders /admin/* in the same bundle.
    const looksLikeFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (looksLikeFile) {
      const assetRes = await env.ASSETS.fetch(req);
      if (assetRes.status !== 404) return assetRes;
    }

    const shellReq = new Request(new URL("/index.html", url.origin).toString(), { headers: req.headers });
    const shell = await env.ASSETS.fetch(shellReq);

    // Enrich a task page's shell with Open Graph / Twitter meta so shared links
    // show the title + first image. Falls back to the plain shell.
    if (url.pathname.startsWith("/tasks/")) {
      const baseHtml = await shell.text();
      const enriched = await injectTaskOg(env, url.pathname, baseHtml).catch(() => null);
      return new Response(enriched ?? baseHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response(shell.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },

  async queue(batch: MessageBatch<NotificationJob>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
