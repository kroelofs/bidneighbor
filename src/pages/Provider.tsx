import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type Me } from "../lib/api";
import AddressOnboarding from "../components/AddressOnboarding";

interface MatchTask { id: string; title: string; category_name: string; town: string | null; county: string | null; timeframe: string | null; budget_cents: number | null }
interface MyResponse { id: string; task_id: string; message: string; quote_cents: number | null; status: string; task_title: string; task_status: string }

export default function Provider({ me, onChange }: { me: Me | null; onChange: () => void }) {
  const [tasks, setTasks] = useState<MatchTask[]>([]);
  const [responses, setResponses] = useState<MyResponse[]>([]);

  useEffect(() => {
    if (!me) return;
    api.get<{ tasks: MatchTask[] }>("/api/provider/tasks").then((d) => setTasks(d.tasks)).catch(() => {});
    api.get<{ responses: MyResponse[] }>("/api/provider/responses").then((d) => setResponses(d.responses)).catch(() => {});
  }, [me]);

  if (!me) return <p className="text-gray-500"><Link to="/login" className="text-brand-600 underline">Sign in</Link> to find work near you.</p>;

  return (
    <div>
      <AddressOnboarding me={me} onSaved={onChange} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Find work</h1>
        <Link to="/provider/profile" className="btn-secondary !py-2 text-sm">Edit profile & categories</Link>
      </div>

      <section className="mt-5">
        <h2 className="font-semibold">Jobs matching your area & categories</h2>
        <div className="mt-3 space-y-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500">No matches yet. Make sure you've set your county and picked categories in your <Link to="/provider/profile" className="text-brand-600 underline">profile</Link>.</p>
          ) : tasks.map((t) => (
            <Link key={t.id} to={`/tasks/${t.id}`} className="card block hover:border-brand-500">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t.title}</h3>
                {t.budget_cents !== null ? <span className="font-semibold text-brand-600">{money(t.budget_cents)}</span> : null}
              </div>
              <p className="mt-1 text-sm text-gray-500">{t.category_name} · {t.town || t.county} {t.timeframe ? `· ${t.timeframe}` : ""}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">My bids</h2>
        <div className="mt-3 space-y-3">
          {responses.length === 0 ? <p className="text-sm text-gray-500">You haven't sent any bids yet.</p> : responses.map((r) => (
            <Link key={r.id} to={`/tasks/${r.task_id}`} className="card block hover:border-brand-500">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{r.task_title}</h3>
                <span className="text-xs uppercase text-gray-400">{r.status}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{r.message.slice(0, 100)}{r.quote_cents !== null ? ` · ${money(r.quote_cents)}` : ""}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
