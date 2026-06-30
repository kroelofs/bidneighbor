import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Entry {
  id: string;
  actor_user_id: string | null;
  impersonator_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export default function AuditLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    api.get<{ entries: Entry[] }>("/api/admin/audit-log").then((d) => setEntries(d.entries)).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit log</h1>
      <p className="mt-1 text-sm text-gray-500">Admin actions and impersonation events. Impersonated actions show both the user and the admin behind them.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
            <tr><th className="py-2">When</th><th>Action</th><th>Actor</th><th>Impersonator</th><th>Entity</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                <td className="font-mono">{e.action}</td>
                <td className="font-mono text-xs">{e.actor_user_id?.slice(0, 8) || "—"}</td>
                <td className="font-mono text-xs">{e.impersonator_id ? <span className="text-amber-600">{e.impersonator_id.slice(0, 8)}</span> : "—"}</td>
                <td className="text-xs">{e.entity_type}{e.entity_id ? `:${e.entity_id.slice(0, 8)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
