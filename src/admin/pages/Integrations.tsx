import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Integration {
  key: string;
  name: string;
  category: string;
  kind: "secret" | "binding";
  required: boolean;
  configured: boolean;
  healthy: boolean | null;
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
        Live status of external services and Cloudflare bindings. Read-only — secret values are never shown.
        Set secrets with <code>wrangler secret put</code>; bindings live in <code>cloud/wrangler.toml</code>.
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
                  {(!i.configured || i.healthy === false) ? (
                    <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <span className="font-medium">Setup: </span>{i.setup}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
