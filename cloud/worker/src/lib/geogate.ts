/**
 * US-only geo gate for the app host.
 *
 * BidNeighbor is a local US marketplace (first market: Sioux County, Iowa), so the
 * product surface (app.bidneighbor.com) is restricted to visitors Cloudflare places
 * in the United States. We read the country from `request.cf.country` — the same edge
 * signal `/api/geo` uses — and block anyone explicitly outside the US.
 *
 * Deliberately NOT gated:
 *  - the admin host (an admin may travel), and
 *  - /api/_health (uptime monitors may probe from anywhere).
 * The bare domain (bidneighbor.com/www) 302-redirects to the app host before reaching
 * this gate, so a non-US visitor there lands on the gated app host and is blocked.
 *
 * Fail-open: if Cloudflare can't determine the country (cf absent in `wrangler dev`,
 * or rare edge cases), we allow the request rather than risk locking out real users.
 */
export function isCountryAllowed(req: Request): boolean {
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  const country = cf?.country;
  // Unknown country (local dev, missing cf) → allow. Otherwise require US.
  if (!country) return true;
  return country === "US";
}

/** 451 block page shown to non-US visitors on the app host. */
export function geoBlockResponse(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BidNeighbor — United States only</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #f8fafc; color: #0f172a; padding: 24px; }
  .card { max-width: 28rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { margin: 0 0 .5rem; line-height: 1.5; color: #475569; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f1f5f9; }
    p { color: #94a3b8; }
  }
</style>
</head>
<body>
  <main class="card">
    <h1>BidNeighbor is only available in the United States</h1>
    <p>It looks like you're visiting from outside the U.S., so we can't serve the app here yet.</p>
    <p>If you believe this is a mistake, please try again without a VPN or proxy.</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 451,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
