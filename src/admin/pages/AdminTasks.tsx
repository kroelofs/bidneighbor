import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface AdminTask { id: string; title: string; status: string; county: string | null; created_at: string }

export default function AdminTasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);

  const load = () => { api.get<{ tasks: AdminTask[] }>("/api/admin/tasks").then((d) => setTasks(d.tasks)).catch(() => {}); };
  useEffect(load, []);

  const setStatus = async (id: string, status: string) => {
    await api.patch(`/api/admin/tasks/${id}`, { status }).catch(() => {});
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Tasks</h1>
      <div className="mt-4 space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{t.title}</p>
              <p className="text-xs text-gray-500">{t.county || "—"} · <span className="uppercase">{t.status}</span></p>
            </div>
            <select className="input !w-auto !py-2 text-sm" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
              {["open", "assigned", "completed", "cancelled", "hidden"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
