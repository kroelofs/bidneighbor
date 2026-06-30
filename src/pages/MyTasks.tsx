import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type Task, type Me } from "../lib/api";

export default function MyTasks({ me }: { me: Me | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me) { setLoading(false); return; }
    // The user's own tasks across every status (open, assigned, completed, …).
    api.get<{ tasks: Task[] }>("/api/my-tasks").then((d) => setTasks(d.tasks)).catch(() => {}).finally(() => setLoading(false));
  }, [me]);

  if (!me) return <p className="text-gray-500"><Link to="/login" className="text-brand-600 underline">Sign in</Link> to see your tasks.</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My tasks</h1>
        <Link to="/post-task" className="btn-primary !py-2 text-sm">Post a task</Link>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? <p className="text-gray-500">Loading…</p> : tasks.length === 0 ? (
          <p className="text-gray-500">You haven't posted any tasks yet.</p>
        ) : tasks.map((t) => (
          <Link key={t.id} to={`/tasks/${t.slug}`} className="card block hover:border-brand-500">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t.title}</h3>
              <span className="text-xs uppercase text-gray-400">{t.status}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t.category_name} {t.budget_cents !== null ? `· ${money(t.budget_cents)}` : ""}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
