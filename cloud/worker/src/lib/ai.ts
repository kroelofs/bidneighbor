import type { Env } from "../types";

/**
 * AI content moderation via the Claude Messages API (raw fetch — this is an edge Worker,
 * no SDK bundled, mirroring email.ts / turnstile.ts). Runs OFF the request path, in the
 * queue consumer, so a slow or failed call never blocks a user.
 *
 * Model: claude-haiku-4-5 — the cheapest tier, well-suited to a short classification.
 * Swap MODEL to "claude-opus-4-8" for maximum accuracy at higher cost.
 */
const MODEL = "claude-haiku-4-5";

export interface ModerationVerdict {
  risky: boolean;
  reason?: string;
  categories?: string[];
}

const VERDICT_TOOL = {
  name: "record_verdict",
  description: "Record the moderation verdict for a marketplace equipment-rental listing.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      risky: {
        type: "boolean",
        description:
          "true if the listing is sexually explicit, hateful, harassing, violent, illegal, a scam, or obvious spam; false for ordinary equipment/tool/vehicle rentals",
      },
      reason: { type: "string", description: "One short sentence explaining the verdict" },
      categories: {
        type: "array",
        items: { type: "string", enum: ["explicit", "hate", "harassment", "violence", "illegal", "scam", "spam", "other"] },
        description: "Matched risk categories; empty array if clear",
      },
    },
    required: ["risky", "reason", "categories"],
    additionalProperties: false,
  },
} as const;

const SYSTEM = [
  "You moderate equipment-rental listings for a small-town neighborly marketplace.",
  "Flag content that is sexually explicit, hateful, harassing, violent, illegal, a scam, or obvious spam.",
  "Ordinary listings for tools, machinery, vehicles, yard/garden equipment, and household items are NOT risky.",
  "Be precise — do not flag a benign listing just because it is oddly worded.",
].join(" ");

/**
 * Returns { risky:false } (fail-open) when the key is absent (local dev) or on any error —
 * the synchronous keyword gate and user reports remain as backstops, so a transient AI
 * blip never hides a legitimate listing. Console-logs the reason, like email.ts.
 */
export async function moderateContent(env: Env, text: string): Promise<ModerationVerdict> {
  if (!env.ANTHROPIC_API_KEY) {
    console.log("[ai] ANTHROPIC_API_KEY absent — skipping AI moderation, treating as clear");
    return { risky: false };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: SYSTEM,
        tools: [VERDICT_TOOL],
        tool_choice: { type: "tool", name: "record_verdict" },
        messages: [{ role: "user", content: `Listing to moderate:\n\n${text}` }],
      }),
    });
  } catch (err) {
    console.error("[ai] moderation request failed", err);
    return { risky: false };
  }

  if (!res.ok) {
    console.error("[ai] moderation HTTP", res.status, await res.text().catch(() => ""));
    return { risky: false };
  }

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; input?: Record<string, unknown> }> }
    | null;
  const block = data?.content?.find((b) => b.type === "tool_use");
  const input = block?.input;
  if (!input || typeof input.risky !== "boolean") {
    console.error("[ai] moderation returned no usable verdict");
    return { risky: false };
  }
  return {
    risky: input.risky,
    reason: typeof input.reason === "string" ? input.reason : undefined,
    categories: Array.isArray(input.categories) ? (input.categories as string[]) : undefined,
  };
}
