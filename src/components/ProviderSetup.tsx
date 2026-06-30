import { useEffect, useState } from "react";
import { api, type Category, type Me } from "../lib/api";
import { COUNTIES, DEFAULT_COUNTY } from "../lib/geo";

/**
 * Quick "become a provider" setup, shown the first time a user switches to the
 * "Do jobs" lens. Two things only — the county you serve and the categories you
 * want jobs for — so the provider dashboard is never an empty dead-end. Saving
 * subscribes to categories, which flips the account to a provider server-side.
 */
export default function ProviderSetup({
  me,
  onClose,
  onComplete,
}: {
  me: Me;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [county, setCounty] = useState(me.county || DEFAULT_COUNTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
    // Pre-check anything they're already subscribed to (e.g. returning provider).
    api.get<{ category_ids: string[] }>("/api/provider/categories").then((d) => setSelected(new Set(d.category_ids))).catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) { setErr("Pick at least one category so we can match you to jobs."); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.patch("/api/me", { county });
      await api.put("/api/provider/categories", { category_ids: Array.from(selected) });
      onComplete();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md bg-white p-6 dark:bg-gray-900">
        <h2 className="text-xl font-bold">Start doing jobs</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Two quick things and you'll see jobs you can do near you. You can change these anytime.
        </p>
        <form onSubmit={save} className="mt-4 space-y-4">
          <div>
            <label className="label">Your county</label>
            <select className="input" value={county} onChange={(e) => setCounty(e.target.value)}>
              {COUNTIES.map((c) => <option key={c.county}>{c.county}</option>)}
            </select>
          </div>
          <div>
            <label className="label">What kind of work do you do?</label>
            <div className="grid grid-cols-2 gap-2">
              {cats.map((c) => (
                <label
                  key={c.id}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                    selected.has(c.id)
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  <input type="checkbox" className="mr-2" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1 disabled:opacity-60" disabled={busy}>
              {busy ? "Saving…" : "Start doing jobs"}
            </button>
            <button type="button" className="px-3 py-2 text-sm text-gray-500 hover:underline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
