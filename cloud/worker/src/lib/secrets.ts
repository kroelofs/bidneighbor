import type { Env } from "../types";

/**
 * Editable secrets — API keys an admin can set live from /admin/integrations.
 *
 * Cloudflare `wrangler secret put` values are DEPLOY-TIME only: the Worker can read
 * them off `env` but cannot write them at runtime. So editable keys are stored as
 * overrides in KV (the RATE_LIMITS namespace) under the `secret:` prefix. Reads prefer
 * the KV override, then fall back to the deploy-time env value, so a value set either
 * way keeps working and the UI can update it without a redeploy.
 *
 * The registry maps the integration `key` (used in the API path + UI) to its env name.
 */
export const EDITABLE_SECRETS = {
  resend: { envName: "EMAIL_API_KEY", label: "Resend API key" },
  openrouter: { envName: "OPENROUTER_API_KEY", label: "OpenRouter API key" },
} as const;

export type EditableSecretKey = keyof typeof EDITABLE_SECRETS;
export type SecretEnvName = (typeof EDITABLE_SECRETS)[EditableSecretKey]["envName"];

const KV_PREFIX = "secret:";

export function isEditableSecretKey(key: string): key is EditableSecretKey {
  return Object.prototype.hasOwnProperty.call(EDITABLE_SECRETS, key);
}

/** Read a secret, preferring a live KV override over the deploy-time env value. */
export async function getSecret(env: Env, envName: SecretEnvName): Promise<string | undefined> {
  const override = await env.RATE_LIMITS.get(KV_PREFIX + envName);
  if (override && override.length > 0) return override;
  const fromEnv = env[envName];
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : undefined;
}

/** True when a secret is set — either as a KV override or a deploy-time env value. */
export async function isSecretConfigured(env: Env, envName: SecretEnvName): Promise<boolean> {
  return (await getSecret(env, envName)) !== undefined;
}

/** Persist a live KV override. Empty string clears the override (falls back to env). */
export async function setSecret(env: Env, envName: SecretEnvName, value: string): Promise<void> {
  if (value.length === 0) {
    await env.RATE_LIMITS.delete(KV_PREFIX + envName);
  } else {
    await env.RATE_LIMITS.put(KV_PREFIX + envName, value);
  }
}
