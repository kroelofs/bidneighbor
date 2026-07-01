import type { Env } from "../types";

/**
 * AI content moderation via OpenRouter (OpenAI-compatible chat/completions, raw fetch —
 * this is an edge Worker, no SDK bundled, mirroring email.ts / turnstile.ts). Runs OFF the
 * request path, in the queue consumer, so a slow or failed call never blocks a user.
 *
 * Model: an OpenRouter `provider/model` slug. Default openai/gpt-4o-mini — cheap and a
 * reliable tool-caller for a short classification. Swap MODEL to any OpenRouter model with
 * function-calling support, e.g. "anthropic/claude-3.5-haiku" or "google/gemini-2.0-flash-001".
 */
const MODEL = "openai/gpt-4o-mini";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ModerationVerdict {
  risky: boolean;
  reason?: string;
  categories?: string[];
}

// OpenAI-style function tool — forcing tool_choice makes the model return a structured verdict.
const VERDICT_TOOL = {
  type: "function",
  function: {
    name: "record_verdict",
    description: "Record the moderation verdict for a marketplace equipment-rental listing.",
    parameters: {
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
  if (!env.OPENROUTER_API_KEY) {
    console.log("[ai] OPENROUTER_API_KEY absent — skipping AI moderation, treating as clear");
    return { risky: false };
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        // Optional OpenRouter attribution headers (surface the app on their dashboard).
        "HTTP-Referer": env.APP_BASE_URL ?? "https://app.bidneighbor.com",
        "X-Title": "BidNeighbor",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Listing to moderate:\n\n${text}` },
        ],
        tools: [VERDICT_TOOL],
        tool_choice: { type: "function", function: { name: "record_verdict" } },
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

  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  } | null;
  // Forced tool_choice → arguments is a JSON string; some models instead put the JSON in content.
  const raw =
    data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
    data?.choices?.[0]?.message?.content;
  if (!raw) {
    console.error("[ai] moderation returned no verdict");
    return { risky: false };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error("[ai] moderation verdict was not valid JSON");
    return { risky: false };
  }
  if (typeof parsed.risky !== "boolean") return { risky: false };
  return {
    risky: parsed.risky,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    categories: Array.isArray(parsed.categories) ? (parsed.categories as string[]) : undefined,
  };
}
