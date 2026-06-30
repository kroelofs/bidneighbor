// Public client config. The Turnstile SITE key is public by design (it appears in
// page HTML); only the SECRET key is sensitive and lives as a Worker secret.
// The widget is bound to the bidneighbor.com hostname (+ any others added in the
// Cloudflare Turnstile dashboard, e.g. localhost for dev).
export const TURNSTILE_SITE_KEY = "0x4AAAAAADtjxrb9EH3ZzII3";
