import type { Env, NotificationJob } from "./types";
import { routeApi } from "./router";
import { resolveSession } from "./lib/session";
import { handleQueue } from "./queue";
import { handleScheduled } from "./cron";
import { injectTaskOg } from "./lib/og";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const host = (req.headers.get("host") || url.host).toLowerCase();

    // Canonical host: bare domain + www → the app host. Keeps one cookie domain and
    // one set of OAuth redirect URIs (app./admin. only). 302 (not 301) while iterating.
    if (host === "bidneighbor.com" || host === "www.bidneighbor.com") {
      return Response.redirect(`${env.APP_BASE_URL}${url.pathname}${url.search}`, 302);
    }

    const isAdminHost = host === env.ADMIN_HOST || host.startsWith("admin.");

    // ---- API ----
    if (url.pathname.startsWith("/api/")) {
      const auth = await resolveSession(req, env);
      const res = await routeApi({ req, env, auth, isAdminHost });
      if (res) return res;
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- Static assets + SPA shells ----
    // Real files (have an extension, e.g. /assets/app-abc.js) come from ASSETS.
    // Everything else is a client-side route and must get the SPA shell for THIS
    // host — admin.html on the admin host, index.html otherwise. (The assets
    // binding default-serves index.html at "/", so we cannot rely on it for the
    // admin host; we pick the shell explicitly.)
    const looksLikeFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (looksLikeFile) {
      const assetRes = await env.ASSETS.fetch(req);
      if (assetRes.status !== 404) return assetRes;
    }

    const shellPath = isAdminHost ? "/admin.html" : "/index.html";
    const shellReq = new Request(new URL(shellPath, url.origin).toString(), { headers: req.headers });
    const shell = await env.ASSETS.fetch(shellReq);

    // On the public host, enrich a task page's shell with Open Graph / Twitter meta
    // so shared links show the title + first image. Falls back to the plain shell.
    if (!isAdminHost && url.pathname.startsWith("/tasks/")) {
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
