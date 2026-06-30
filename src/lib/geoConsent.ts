// Approximate-location consent + cache. Location is only ever fetched/stored
// AFTER the user clicks "Allow" in the consent banner. Everything lives in
// cookies (consent decision + the cached geo), per our privacy approach.

import { api } from "./api";

export interface Geo {
  city: string | null;
  state: string | null;
  region: string | null;
  zip: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
}

const CONSENT = "bn_geo_consent"; // "1" allowed, "0" declined, absent = undecided
const GEO = "bn_geo"; // JSON-encoded Geo
const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string, maxAge = YEAR) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}
function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function consentDecided(): boolean {
  return getCookie(CONSENT) !== null;
}
export function hasConsent(): boolean {
  return getCookie(CONSENT) === "1";
}

export function loadGeo(): Geo | null {
  if (!hasConsent()) return null;
  const raw = getCookie(GEO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Geo;
  } catch {
    return null;
  }
}

/** Record the consent decision. On "allow", fetch + cache edge geo and return it. */
export async function decideConsent(allow: boolean): Promise<Geo | null> {
  setCookie(CONSENT, allow ? "1" : "0");
  if (!allow) return null;
  try {
    const geo = await api.get<Geo>("/api/geo");
    setCookie(GEO, JSON.stringify(geo));
    return geo;
  } catch {
    return null;
  }
}
