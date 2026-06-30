// Public client config. The Turnstile SITE key is public by design (it appears in
// page HTML); only the SECRET key is sensitive and lives as a Worker secret.
// The widget is bound to the bidneighbor.com hostname (+ any others added in the
// Cloudflare Turnstile dashboard, e.g. localhost for dev).
export const TURNSTILE_SITE_KEY = "0x4AAAAAADtjxrb9EH3ZzII3";

export const APP_ORIGIN = "https://app.bidneighbor.com";

/** Sign-in always lands on the app host. On the app host itself (or local dev) use a
 *  relative path; anywhere else (e.g. the bidneighbor.com marketing apex), an absolute
 *  URL to app.bidneighbor.com. */
export function loginHref(): string {
  if (typeof window === "undefined") return "/login";
  const h = window.location.hostname;
  const onApp = h === "app.bidneighbor.com" || h === "localhost" || h === "127.0.0.1";
  return onApp ? "/login" : `${APP_ORIGIN}/login`;
}
