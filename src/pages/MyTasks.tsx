import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type Task, type Me } from "../lib/api";
import StatusChip from "../components/StatusChip";

export default function MyTasks({ me }: { me: Me | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!me) { setLoading(false); return; }
    // The user's own tasks across every status (open, assigned, completed, …).
    api.get<{ tasks: Task[] }>("/api/my-tasks").then((d) => setTasks(d.tasks)).catch(() => {}).finally(() => setLoading(false));
  }, [me]);

  async function removeTask(t: Task) {
    if (!confirm(`Remove "${t.title}"? This can't be undone and providers will no longer see it.`)) return;
    setRemovingId(t.id);
    try {
      await api.del(`/api/tasks/${t.id}`);
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not remove the task. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

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
          <div key={t.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/tasks/${t.slug}`} className="min-w-0 flex-1 hover:text-brand-600">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{t.category_name} {t.budget_cents !== null ? `· ${money(t.budget_cents)}` : ""}</p>
              </Link>
              <div className="flex flex-col items-end gap-2">
                <StatusChip status={t.status} kind="task" />
                <button
                  type="button"
                  onClick={() => removeTask(t)}
                  disabled={removingId === t.id}
                  className="-mr-2 px-2 py-1 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {removingId === t.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
