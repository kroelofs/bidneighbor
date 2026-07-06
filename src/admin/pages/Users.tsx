import { useEffect, useState } from "react";
import { api, type Me } from "../../lib/api";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  admin_level: string | null;
  county: string | null;
  status: string;
  created_at: string;
}

export default function Users({ me }: { me: Me }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    api.get<{ users: AdminUser[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((d) => setUsers(d.users)).catch(() => {});
  };
  useEffect(load, []);

  const canImpersonate = me.admin_level === "admin" || me.admin_level === "superadmin";

  const impersonate = async (u: AdminUser) => {
    if (!confirm(`Log in as ${u.email}? This is audit-logged.`)) return;
    setBusy(u.id);
    try {
      const res = await api.post<{ redirect_url: string }>(`/api/admin/users/${u.id}/impersonate`);
      window.location.href = res.redirect_url;
    } catch (err) {
      alert((err as Error).message);
      setBusy(null);
    }
  };

  const setStatus = async (u: AdminUser, status: string) => {
    await api.patch(`/api/admin/users/${u.id}`, { status }).catch(() => {});
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <div className="mt-3 flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name…" onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn-secondary" onClick={load}>Search</button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
            <tr><th className="py-2">Email</th><th>Name</th><th>Role</th><th>County</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2">{u.email}{u.admin_level ? <span className="ml-1 rounded bg-brand-100 px-1 text-xs text-brand-700">{u.admin_level}</span> : null}</td>
                <td>{u.name || "—"}</td>
                <td>{u.role}</td>
                <td>{u.county || "—"}</td>
                <td>{u.status === "suspended" ? <span className="text-red-600">suspended</span> : "active"}</td>
                <td className="whitespace-nowrap text-right">
                  {canImpersonate && u.id !== me.id ? (
                    <button onClick={() => impersonate(u)} disabled={busy === u.id} className="mr-2 text-brand-600 underline disabled:opacity-50">
                      {busy === u.id ? "…" : "Log in as"}
                    </button>
                  ) : null}
                  {u.status === "suspended" ? (
                    <button onClick={() => setStatus(u, "active")} className="text-green-600 underline">Unsuspend</button>
                  ) : (
                    <button onClick={() => setStatus(u, "suspended")} className="text-red-600 underline">Suspend</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
