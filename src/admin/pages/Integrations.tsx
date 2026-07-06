import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../../lib/api";

interface Integration {
  key: string;
  name: string;
  category: string;
  kind: "secret" | "binding";
  required: boolean;
  configured: boolean;
  healthy: boolean | null;
  editable?: boolean;
  detail: string;
  setup: string;
}
interface IntegrationsResponse {
  integrations: Integration[];
  deploy: { sha: string; deployed_at: string | null };
}

function statusFor(i: Integration): { label: string; classes: string } {
  if (i.healthy === false) return { label: "Error", classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (!i.configured) {
    return i.required
      ? { label: "Not configured", classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" }
      : { label: "Optional — off", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  }
  if (i.healthy === true) return { label: "Connected", classes: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
  return { label: "Configured", classes: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
}

/**
 * Step-by-step setup instructions per integration. Editable keys (Resend, OpenRouter)
 * end at the Save field below; the rest are deploy-time `wrangler secret`s. Falls back
 * to the server-provided one-liner for any integration without hand-written steps.
 */
function setupSteps(i: Integration): ReactNode[] {
  switch (i.key) {
    case "google_oauth":
      return [
        <>In Google Cloud Console, open <b>APIs &amp; Services → Credentials</b>.</>,
        <>Create an <b>OAuth 2.0 Client ID</b> of type <b>Web application</b>.</>,
        <>Add <code>https://app.bidneighbor.com</code> to <b>Authorized JavaScript origins</b> and your OAuth callback URL to <b>Authorized redirect URIs</b>.</>,
        <>Copy the <b>Client ID</b> and <b>Client secret</b>.</>,
        <>From <code>cloud/</code>, run <code>wrangler secret put GOOGLE_OAUTH_CLIENT_ID</code> and <code>wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET</code>, then redeploy.</>,
      ];
    case "session_key":
      return [
        <>Generate 32+ random bytes, e.g. <code>openssl rand -base64 48</code>.</>,
        <>From <code>cloud/</code>, run <code>wrangler secret put SESSION_SIGNING_KEY</code> and paste the value.</>,
        <>Redeploy. Changing the key signs out all existing sessions.</>,
      ];
    case "resend":
      return [
        <>Create a <a className="underline" href="https://resend.com" target="_blank" rel="noreferrer">Resend</a> account and add the <b>bidneighbor.com</b> domain.</>,
        <>Add the SPF/DKIM DNS records Resend shows you and wait for the domain to verify.</>,
        <>Create an API key at <a className="underline" href="https://resend.com/api-keys" target="_blank" rel="noreferrer">resend.com/api-keys</a> with sending permission.</>,
        <>Paste the key in the <b>field below</b> and click <b>Save</b>.</>,
      ];
    case "turnstile":
      return [
        <>In the Cloudflare dashboard, open <b>Turnstile</b> and add a widget for <code>app.bidneighbor.com</code>.</>,
        <>Copy the widget's <b>Secret key</b>.</>,
        <>From <code>cloud/</code>, run <code>wrangler secret put TURNSTILE_SECRET_KEY</code>, then redeploy.</>,
        <>Put the matching <b>Site key</b> in the frontend Turnstile widget config.</>,
      ];
    case "openrouter":
      return [
        <>Create an account at <a className="underline" href="https://openrouter.ai" target="_blank" rel="noreferrer">openrouter.ai</a> and add credits.</>,
        <>Create an API key at <a className="underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.</>,
        <>Paste the key in the <b>field below</b> and click <b>Save</b>.</>,
      ];
    default:
      return [i.setup];
  }
}

/** Inline API-key setter for editable secrets (Resend, OpenRouter). Never shows the current value. */
function SecretEditor({ integration, onSaved }: { integration: Integration; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const save = () => {
    const v = value.trim();
    if (!v || saving) return;
    setSaving(true);
    setErr(null);
    setSavedOk(false);
    api
      .post(`/api/admin/integrations/${integration.key}`, { value: v })
      .then(() => {
        setValue("");
        setSavedOk(true);
        onSaved();
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
        {integration.configured ? "Replace API key" : "Set API key"}
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          autoComplete="off"
          spellCheck={false}
          placeholder={integration.configured ? "Enter a new key to replace the current one" : "Paste API key"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="input !py-2 text-sm"
        />
        <button className="btn-primary !py-2 text-sm" disabled={saving || !value.trim()} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
      {savedOk ? <p className="mt-1 text-xs text-green-600">Saved. New requests use the updated key immediately.</p> : null}
    </div>
  );
}

export default function Integrations() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<IntegrationsResponse>("/api/admin/integrations").then(setData).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <p className="py-12 text-center text-gray-500">Checking integrations…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return null;

  const categories = Array.from(new Set(data.integrations.map((i) => i.category)));
  const problems = data.integrations.filter((i) => i.healthy === false || (i.required && !i.configured)).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <button className="btn-secondary !py-2 text-sm" onClick={load}>Re-check</button>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Live status of external services. Editable keys (Resend, OpenRouter) can be set right here — current
        values are never shown. Other secrets are set with <code>wrangler secret put</code>.
      </p>

      <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${problems ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"}`}>
        {problems ? `${problems} integration${problems > 1 ? "s" : ""} need attention before production.` : "All required integrations are configured and healthy."}
        <span className="ml-2 text-xs opacity-70">Deploy: {data.deploy.sha.slice(0, 8)}</span>
      </div>

      {categories.map((cat) => (
        <section key={cat} className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{cat}</h2>
          <div className="space-y-3">
            {data.integrations.filter((i) => i.category === cat).map((i) => {
              const s = statusFor(i);
              return (
                <div key={i.key} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{i.name}{i.required ? <span className="text-xs text-gray-400">(required)</span> : null}</h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{i.detail}</p>
                    </div>
                    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${s.classes}`}>{s.label}</span>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer select-none text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      How to set this up
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 rounded-md bg-gray-50 py-3 pl-8 pr-4 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {setupSteps(i).map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </details>
                  {i.editable ? <SecretEditor integration={i} onSaved={load} /> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
