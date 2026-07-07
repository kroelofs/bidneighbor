import type { Env } from "../types";
import { uuid, now } from "./http";

/**
 * Usage/cost reporting for the /admin/integrations cards.
 *
 * - OpenRouter: we log one `openrouter_usage` row per AI call (cost from the API's
 *   `usage.cost`) and report a trailing daily-cost series.
 * - Resend: no extra table — every email is already a `notifications` row with
 *   status='sent', so we report a trailing weekly sent-count series.
 *
 * The report shape is deliberately generic (labelled series + pre-formatted summary
 * chips) so the frontend renders both the same way without knowing the metric.
 */
export interface UsageReport {
  key: string;
  /** Heading for the dropdown body, e.g. "Daily cost (last 14 days)". */
  title: string;
  unit: "usd" | "count";
  /** Left-to-right bars, oldest → newest. `sub` is an optional caption under a bar. */
  series: { label: string; value: number; sub?: string }[];
  /** Pre-formatted stat chips, e.g. { label: "Last 7 days", value: "$0.0142" }. */
  summary: { label: string; value: string }[];
  /** True when there is no data yet (nothing sent / no AI calls). */
  empty: boolean;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
/** ISO cutoff for "N days ago" as a rolling window (start of that UTC day). */
function cutoffIso(days: number): string {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function usd(n: number): string {
  if (n === 0) return "$0";
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
/** "Jul 6" from a YYYY-MM-DD string, without pulling in a locale-heavy formatter. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(isoDayStr: string): string {
  const [, m, d] = isoDayStr.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/**
 * Record one OpenRouter call's cost. Best-effort: a logging failure must never break
 * moderation/draft, so all errors are swallowed (mirrors the fail-open style of ai.ts).
 */
export async function recordOpenRouterUsage(
  env: Env,
  model: string,
  kind: "moderation" | "draft",
  costUsd: number,
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO openrouter_usage (id, model, kind, cost_usd, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(uuid(), model, kind, Number.isFinite(costUsd) ? costUsd : 0, now())
      .run();
  } catch (err) {
    console.error("[usage] failed to record OpenRouter usage", err);
  }
}

/** Daily OpenRouter spend for the last 14 days, plus today / 7-day / 30-day totals. */
export async function openrouterUsageReport(env: Env): Promise<UsageReport> {
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, SUM(cost_usd) AS cost, COUNT(*) AS calls
     FROM openrouter_usage WHERE created_at >= ? GROUP BY day`,
  )
    .bind(cutoffIso(30))
    .all<{ day: string; cost: number; calls: number }>();

  const byDay = new Map((results ?? []).map((r) => [r.day, { cost: r.cost ?? 0, calls: r.calls ?? 0 }]));

  // Continuous 14-day series (fill gaps with zero) so the bars read as a calendar.
  const series: UsageReport["series"] = [];
  for (let i = 13; i >= 0; i--) {
    const day = isoDay(new Date(Date.now() - i * DAY_MS));
    const hit = byDay.get(day);
    series.push({ label: shortDate(day), value: hit?.cost ?? 0, sub: hit ? `${hit.calls} call${hit.calls === 1 ? "" : "s"}` : "" });
  }

  const today = isoDay(new Date());
  const sinceDay = (n: number): number => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += byDay.get(isoDay(new Date(Date.now() - i * DAY_MS)))?.cost ?? 0;
    return sum;
  };
  const total30 = (results ?? []).reduce((s, r) => s + (r.cost ?? 0), 0);

  return {
    key: "openrouter",
    title: "Daily cost (last 14 days)",
    unit: "usd",
    series,
    summary: [
      { label: "Today", value: usd(byDay.get(today)?.cost ?? 0) },
      { label: "Last 7 days", value: usd(sinceDay(7)) },
      { label: "Last 30 days", value: usd(total30) },
    ],
    empty: (results ?? []).length === 0,
  };
}

/** Emails sent (Resend) per week for the last 8 weeks, from the notifications log. */
export async function resendUsageReport(env: Env): Promise<UsageReport> {
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS sent
     FROM notifications WHERE status = 'sent' AND created_at >= ? GROUP BY day`,
  )
    .bind(cutoffIso(56))
    .all<{ day: string; sent: number }>();

  const byDay = new Map((results ?? []).map((r) => [r.day, r.sent ?? 0]));

  // Monday-anchored week start for a given date (UTC).
  const weekStart = (d: Date): Date => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    const dow = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    x.setUTCDate(x.getUTCDate() - dow);
    return x;
  };
  const sumWeek = (start: Date): number => {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += byDay.get(isoDay(new Date(start.getTime() + i * DAY_MS))) ?? 0;
    return sum;
  };

  const thisWeek = weekStart(new Date());
  const series: UsageReport["series"] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(thisWeek.getTime() - w * 7 * DAY_MS);
    series.push({ label: `Wk ${shortDate(isoDay(start))}`, value: sumWeek(start) });
  }

  const total = (results ?? []).reduce((s, r) => s + (r.sent ?? 0), 0);
  const lastWeek = new Date(thisWeek.getTime() - 7 * DAY_MS);

  return {
    key: "resend",
    title: "Emails sent per week (last 8 weeks)",
    unit: "count",
    series,
    summary: [
      { label: "This week", value: String(sumWeek(thisWeek)) },
      { label: "Last week", value: String(sumWeek(lastWeek)) },
      { label: "Last 8 weeks", value: String(total) },
    ],
    empty: total === 0,
  };
}
