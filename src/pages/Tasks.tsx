import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, money, type Task, type Category } from "../lib/api";
import { COUNTIES, DEFAULT_COUNTY, townsForCounty } from "../lib/geo";

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const category = params.get("category") ?? "";
  const county = params.get("county") ?? "";
  const town = params.get("town") ?? "";

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError(false);
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (county) qs.set("county", county);
    if (town) qs.set("town", town);
    api.get<{ tasks: Task[] }>(`/api/tasks?${qs.toString()}`)
      .then((d) => setTasks(d.tasks))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [category, county, town]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "county") next.delete("town");
    setParams(next);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Local jobs</h1>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select className="input" value={category} onChange={(e) => setFilter("category", e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={county || DEFAULT_COUNTY} onChange={(e) => setFilter("county", e.target.value)}>
          {COUNTIES.map((c) => <option key={c.county} value={c.county}>{c.county}</option>)}
        </select>
        <select className="input" value={town} onChange={(e) => setFilter("town", e.target.value)}>
          <option value="">All towns</option>
          {townsForCounty(county || DEFAULT_COUNTY).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : error ? (
          <div className="card text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">Couldn't load jobs just now.</p>
            <button onClick={load} className="btn-secondary mt-3 !py-2 text-sm">Try again</button>
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-gray-500">No open jobs match your filters yet.</p>
        ) : (
          tasks.map((t) => (
            <Link key={t.id} to={`/tasks/${t.slug}`} className="card block hover:border-brand-500">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t.category_name} · {t.town || t.county} {t.timeframe ? `· ${t.timeframe}` : ""}
                  </p>
                </div>
                {t.budget_cents !== null ? <span className="whitespace-nowrap font-semibold text-brand-600">{money(t.budget_cents)}</span> : null}
              </div>
              <p className="mt-2 text-xs text-gray-400">Posted {new Date(t.created_at).toLocaleDateString()}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
