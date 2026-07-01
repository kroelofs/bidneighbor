import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface AdminResource {
  id: string;
  title: string;
  description: string;
  status: string;
  moderation_state: string;
  county: string | null;
  created_at: string;
}

export default function AdminResources() {
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [filter, setFilter] = useState<"flagged" | "all">("flagged");

  const load = () => {
    const qs = filter === "flagged" ? "?status=flagged" : "";
    api.get<{ resources: AdminResource[] }>(`/api/admin/resources${qs}`).then((d) => setResources(d.resources)).catch(() => {});
  };
  useEffect(load, [filter]);

  const setStatus = async (id: string, status: string) => {
    await api.patch(`/api/admin/resources/${id}`, { status }).catch(() => {});
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resources</h1>
        <select className="input !w-auto !py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as "flagged" | "all")}>
          <option value="flagged">Flagged queue</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="mt-4 space-y-2">
        {resources.length === 0 ? (
          <p className="card text-center text-sm text-gray-500">Nothing here.</p>
        ) : resources.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-gray-500">{r.county || "—"} · <span className="uppercase">{r.status}</span> · AI: {r.moderation_state}</p>
              </div>
              <select className="input !w-auto !py-2 text-sm" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                {["active", "flagged", "hidden", "removed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{r.description}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setStatus(r.id, "active")} className="btn-secondary !py-2 text-sm">Approve</button>
              <button onClick={() => setStatus(r.id, "hidden")} className="btn-secondary !py-2 text-sm">Hide</button>
              <button onClick={() => setStatus(r.id, "removed")} className="btn-secondary !py-2 text-sm">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
