import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Dashboard() {
  const [counts, setCounts] = useState({ users: 0, tasks: 0 });

  useEffect(() => {
    Promise.all([
      api.get<{ users: unknown[] }>("/api/admin/users").then((d) => d.users.length).catch(() => 0),
      api.get<{ tasks: unknown[] }>("/api/admin/tasks").then((d) => d.tasks.length).catch(() => 0),
    ]).then(([users, tasks]) => setCounts({ users, tasks }));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-gray-500">Users</p><p className="text-3xl font-bold">{counts.users}</p></div>
        <div className="card"><p className="text-sm text-gray-500">Tasks</p><p className="text-3xl font-bold">{counts.tasks}</p></div>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        Use the tabs to moderate users and tasks. Every admin action — including impersonation —
        is recorded in the Audit log.
      </p>
    </div>
  );
}
