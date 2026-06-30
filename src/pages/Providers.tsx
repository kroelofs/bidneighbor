import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface DirProvider {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

function locationLine(p: DirProvider): string {
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  return [cityState, p.zip].filter(Boolean).join(" ");
}

export default function Providers() {
  const [providers, setProviders] = useState<DirProvider[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get<{ providers: DirProvider[] }>("/api/providers").then((d) => setProviders(d.providers)).catch(() => setProviders([]));
  }, []);

  const filtered = (providers ?? []).filter((p) => {
    if (!q.trim()) return true;
    const hay = `${p.name ?? ""} ${p.city ?? ""} ${p.state ?? ""} ${p.zip ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Provider directory</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Local providers serving the area.</p>

      <input
        className="input mt-4"
        placeholder="Search by name, city, state, or ZIP"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {providers === null ? (
        <p className="mt-6 text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-gray-500">No providers found.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => (
            <div key={p.id} className="card">
              <p className="font-medium">{p.name || "Provider"}</p>
              <p className="text-sm text-gray-500">{locationLine(p) || "Location not set"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
