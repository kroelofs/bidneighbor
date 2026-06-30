import type { Env, AuthContext } from "../types";
import { json, error, badRequest, unauthorized } from "../lib/http";
import { rateLimit } from "../lib/ratelimit";
import { parseSuggestions, parsePlaceDetails, type GooglePlaceDetails } from "../lib/places";

// US-only marketplace — bias suggestions to the United States.
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_FIELDS = "formattedAddress,location,addressComponents";

/** POST /api/places/autocomplete  body: { input, sessionToken } — sign-in required (protects the billable key). */
export async function autocomplete(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (!env.GOOGLE_PLACES_API_KEY) return error(503, "Address lookup is not configured");
  const body = (await req.json().catch(() => ({}))) as { input?: string; sessionToken?: string };
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (input.length < 3) return json({ suggestions: [] });

  const rl = await rateLimit(env, `places:${auth.user.id}`, 120, 60);
  if (!rl.ok) return error(429, "Too many lookups. Slow down a moment.");

  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
    },
    body: JSON.stringify({
      input,
      sessionToken: typeof body.sessionToken === "string" ? body.sessionToken : undefined,
      includedRegionCodes: ["us"],
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    }),
  });
  if (!res.ok) return error(502, "Address lookup failed");
  const data = (await res.json().catch(() => ({}))) as Parameters<typeof parseSuggestions>[0];
  return json({ suggestions: parseSuggestions(data) });
}

/** GET /api/places/details?placeId=&sessionToken= — returns structured address + lat/lng. Sign-in required. */
export async function details(req: Request, env: Env, auth: AuthContext | null): Promise<Response> {
  if (!auth) return unauthorized();
  if (!env.GOOGLE_PLACES_API_KEY) return error(503, "Address lookup is not configured");
  const url = new URL(req.url);
  const placeId = url.searchParams.get("placeId");
  const sessionToken = url.searchParams.get("sessionToken");
  if (!placeId) return badRequest("Missing placeId");

  const rl = await rateLimit(env, `places:${auth.user.id}`, 120, 60);
  if (!rl.ok) return error(429, "Too many lookups. Slow down a moment.");

  const detailsUrl = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) detailsUrl.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(detailsUrl.toString(), {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": DETAILS_FIELDS,
    },
  });
  if (!res.ok) return error(502, "Address lookup failed");
  const data = (await res.json().catch(() => ({}))) as GooglePlaceDetails;
  return json({ address: parsePlaceDetails(data) });
}
