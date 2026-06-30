import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money, type Task, type Me } from "../lib/api";

interface ResponseItem {
  id: string;
  message: string;
  quote_cents: number | null;
  status: string;
  created_at: string;
  provider: { id: string; name: string | null; town: string | null; county: string | null; provider_bio: string | null };
}
interface FileItem { id: string; filename: string | null; content_type: string }

export default function TaskDetail({ me }: { me: Me | null }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [sort, setSort] = useState<"newest" | "price">("newest");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadResponses = () => {
    if (!me || !id) return;
    api.get<{ responses: ResponseItem[] }>(`/api/tasks/${id}/responses`).then((d) => setResponses(d.responses)).catch(() => {});
  };

  useEffect(() => {
    if (!id) return;
    api.get<{ task: Task; files: FileItem[] }>(`/api/tasks/${id}`).then((d) => { setTask(d.task); setFiles(d.files); }).catch(() => setTask(null));
  }, [id]);
  useEffect(loadResponses, [id, me]);

  if (!task) return <p className="text-gray-500">Loading…</p>;
  // Ownership is enforced server-side: the owner endpoint returns every provider's
  // response, so seeing a response from someone other than yourself means you're the owner.
  const ownerView = !!me && (responses.some((r) => r.provider.id !== me.id) || task.status === "assigned");

  const sorted = [...responses].sort((a, b) =>
    sort === "price" ? (a.quote_cents ?? Infinity) - (b.quote_cents ?? Infinity) : b.created_at.localeCompare(a.created_at),
  );

  const submitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/tasks/${id}/responses`, { message, quote });
      setMessage(""); setQuote("");
      loadResponses();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const select = async (responseId: string) => {
    await api.post(`/api/tasks/${id}/select-response`, { response_id: responseId }).catch(() => {});
    loadResponses();
  };

  return (
    <div>
      {params.get("posted") ? (
        <div className="card mb-4 border-green-300 bg-green-50 dark:bg-green-900/20">
          <p className="font-medium">Your task is live! Share this link:</p>
          <code className="text-sm break-all">{window.location.origin}/tasks/{task.id}</code>
        </div>
      ) : null}

      <h1 className="text-2xl font-bold">{task.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {task.category_name} · {task.town || task.county} {task.timeframe ? `· ${task.timeframe}` : ""}
        {task.budget_cents !== null ? ` · ${money(task.budget_cents)}` : ""}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{task.description}</p>
      {task.location_note ? <p className="mt-2 text-sm text-gray-500">Area: {task.location_note}</p> : null}

      {files.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {files.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 underline">
              {f.content_type.startsWith("image/") ? "View photo" : f.filename || "View file"}
            </a>
          ))}
        </div>
      ) : null}

      {/* Respond (providers) */}
      {me ? (
        <div className="card mt-6">
          <h2 className="font-semibold">Interested? Send a message or quote</h2>
          <form onSubmit={submitResponse} className="mt-3 space-y-3">
            <textarea className="input min-h-20" required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask a question or describe how you'd help." />
            <input className="input" inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Optional quote ($)" />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className="btn-primary">I'm interested</button>
          </form>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500"><Link to="/login" className="text-brand-600 underline">Sign in</Link> to respond to this job.</p>
      )}

      {/* Responses (owner sees all + can select) */}
      {responses.length ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Responses ({responses.length})</h2>
            {ownerView ? (
              <select className="input !w-auto !py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "price")}>
                <option value="newest">Newest</option>
                <option value="price">Price (low→high)</option>
              </select>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            {sorted.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.provider.name || "Provider"} {r.provider.town ? `· ${r.provider.town}` : ""}</p>
                    {r.provider.provider_bio ? <p className="text-xs text-gray-500">{r.provider.provider_bio}</p> : null}
                  </div>
                  {r.quote_cents !== null ? <span className="font-semibold text-brand-600">{money(r.quote_cents)}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>
                {ownerView && task.status === "open" ? (
                  <button onClick={() => select(r.id)} className="btn-secondary mt-3 !py-2 text-sm">Select this provider</button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
