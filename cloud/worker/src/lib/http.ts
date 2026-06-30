export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function error(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, { status });
}

export const notFound = () => error(404, "Not found");
export const unauthorized = () => error(401, "Sign in required");
export const forbidden = () => error(403, "Not allowed");
export const badRequest = (msg = "Bad request") => error(400, msg);

export function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

/** ISO-8601 UTC timestamp. */
export function now(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}
