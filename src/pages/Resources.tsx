import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, resourceFileUrl, type Resource, type Me } from "../lib/api";

export default function Resources({ me }: { me: Me | null }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [county, setCounty] = useState(me?.county ?? "");

  const load = () => {
    const params = new URLSearchParams();
    if (county) params.set("county", county);
    if (q.trim()) params.set("q", q.trim());
    api.get<{ resources: Resource[] }>(`/api/resources?${params.toString()}`)
      .then((d) => { setResources(d.resources); setLoaded(true); })
      .catch(() => setLoaded(true));
  };

  useEffect(load, []); // initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Neighborhood Resources</h1>
          <p className="mt-1 text-sm text-gray-500">Rent equipment from neighbors — or earn from gear sitting in your yard.</p>
        </div>
        {me ? <Link to="/resources/new" className="btn-primary">List your equipment</Link> : null}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mt-4 flex flex-wrap gap-2">
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search equipment (e.g. pressure washer)" />
        <input className="input !w-auto" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="County" />
        <button className="btn-secondary">Search</button>
      </form>

      {!loaded ? (
        <p className="py-12 text-center text-gray-500">Loading…</p>
      ) : resources.length === 0 ? (
        <div className="card mt-6 text-center text-sm text-gray-500">
          No listings yet. {me ? <Link to="/resources/new" className="text-brand-600 underline">Be the first to list something</Link> : "Check back soon"} — that ladder or tiller in your garage could be earning.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <Link key={r.id} to={`/resources/${r.id}`} className="card transition hover:border-brand-300">
              {r.cover_file_id ? (
                <img src={resourceFileUrl(r.id, r.cover_file_id)} alt={r.title} loading="lazy"
                  className="mb-3 aspect-video w-full rounded-lg border border-gray-200 object-cover dark:border-gray-800" />
              ) : (
                <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-gray-200 text-3xl dark:border-gray-800">🛠️</div>
              )}
              <p className="font-semibold">{r.title}</p>
              <p className="mt-1 text-sm text-gray-500">{r.town || r.county}{r.owner?.name ? ` · ${r.owner.name}` : ""}</p>
              {r.daily_rate_cents !== null ? <p className="mt-1 font-semibold text-brand-600">{money(r.daily_rate_cents)}<span className="text-xs font-normal text-gray-500">/day</span></p> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
