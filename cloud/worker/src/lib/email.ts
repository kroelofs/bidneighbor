import type { Env } from "../types";

/**
 * Send a transactional email via Resend's HTTP API. Called only from the Queue
 * consumer (never inside ctx.waitUntil). If EMAIL_API_KEY is unset (local dev),
 * the email is logged to the console instead of sent.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; detail?: string }> {
  if (!env.EMAIL_API_KEY) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return { ok: true, detail: "dev-noop" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, detail };
  }
  return { ok: true };
}

export function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
    ${bodyHtml}
    <p style="margin-top:32px;font-size:12px;color:#888">BidNeighbor.com — local jobs, local people.</p>
  </div>`;
}
