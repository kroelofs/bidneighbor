import { json } from "../lib/http";

/**
 * GET /api/geo — best-effort approximate location from Cloudflare's edge
 * (request.cf), used to pre-fill location fields AFTER the user consents on the
 * client. No lookup, no storage; just echoes the edge-derived city/state/zip.
 * cf properties are absent in plain `wrangler dev`, so fields may be null locally.
 */
export function getGeo(req: Request): Response {
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  return json({
    city: cf?.city ?? null,
    state: cf?.regionCode ?? null, // e.g. "IA"
    region: cf?.region ?? null, // e.g. "Iowa"
    zip: cf?.postalCode ?? null,
    country: cf?.country ?? null,
    latitude: cf?.latitude ?? null,
    longitude: cf?.longitude ?? null,
  });
}
