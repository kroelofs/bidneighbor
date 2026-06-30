import type { Env, NotificationJob } from "./types";
import { routeApi } from "./router";
import { resolveSession } from "./lib/session";
import { handleQueue } from "./queue";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const host = req.headers.get("host") || url.host;
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
    // Try the asset first; on a miss for a navigation request, serve the right shell
    // (admin.html on the admin host, index.html otherwise) so client-side routing works.
    const assetRes = await env.ASSETS.fetch(req);
    if (assetRes.status !== 404) return assetRes;

    const shellPath = isAdminHost ? "/admin.html" : "/index.html";
    const shellReq = new Request(new URL(shellPath, url.origin).toString(), { headers: req.headers });
    const shell = await env.ASSETS.fetch(shellReq);
    return new Response(shell.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },

  async queue(batch: MessageBatch<NotificationJob>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },
};
