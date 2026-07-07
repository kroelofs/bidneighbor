import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, money, openConversation, type Task, type Me } from "../lib/api";
import { useMode } from "../lib/mode";
import StatusChip from "../components/StatusChip";

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
  // The route param is a slug ("<title>-<locality>-<id8>") or a legacy UUID; the
  // server resolves either. All follow-up calls use the canonical task.id.
  const { id: ref } = useParams();
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const [params] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [sort, setSort] = useState<"newest" | "price">("newest");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  const taskId = task?.id;

  const loadResponses = () => {
    if (!me || !taskId) return;
    api.get<{ responses: ResponseItem[] }>(`/api/tasks/${taskId}/responses`).then((d) => setResponses(d.responses)).catch(() => {});
  };

  const loadTask = () => {
    if (!ref) return;
    api.get<{ task: Task; files: FileItem[]; is_owner?: boolean }>(`/api/tasks/${ref}`).then((d) => {
      setTask(d.task);
      setIsOwner(!!d.is_owner);
      setFiles(d.files);
      // Upgrade legacy/short URLs in the address bar to the canonical pretty slug.
      const canonical = new URL(d.task.share_url).pathname;
      if (window.location.pathname !== canonical) {
        window.history.replaceState(null, "", canonical + window.location.search);
      }
    }).catch(() => { setTask(null); setLoadError(true); });
  };

  useEffect(loadTask, [ref]);
  useEffect(loadResponses, [taskId, me]);

  // A missing/removed task (deleted listing, dead shared link) must not look like an
  // eternal spinner — tell the visitor plainly and give them a way back.
  if (loadError) return (
    <div className="card mx-auto max-w-md text-center">
      <p className="font-medium">This task isn't available.</p>
      <p className="mt-1 text-sm text-gray-500">It may have been removed or the link is out of date.</p>
      <Link to="/tasks" className="btn-primary mt-4 inline-flex">Browse local jobs</Link>
    </div>
  );
  if (!task) return <p className="text-gray-500">Loading…</p>;
  // Ownership comes straight from the API (it knows the task's customer_id); no more
  // guessing from response counts. The owner always sees owner controls; a non-owner
  // sees the respond form only in the "Do jobs" lens.
  const ownerView = isOwner;
  const canRespond = !!me && !isOwner && task.status === "open";

  const sorted = [...responses].sort((a, b) =>
    sort === "price" ? (a.quote_cents ?? Infinity) - (b.quote_cents ?? Infinity) : b.created_at.localeCompare(a.created_at),
  );

  const submitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/tasks/${taskId}/responses`, { message, quote });
      setMessage(""); setQuote("");
      loadResponses();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const select = async (r: ResponseItem) => {
    const who = r.provider.name || "this provider";
    if (!confirm(`Hire ${who}? They'll be notified and your task will be marked as assigned. Other providers won't be selected.`)) return;
    setError(null);
    setSelecting(r.id);
    try {
      await api.post(`/api/tasks/${taskId}/select-response`, { response_id: r.id });
      loadTask();
      loadResponses();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSelecting(null);
    }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(task!.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link stays visible for manual copy */
    }
  };

  // Open (or reuse) a private thread and jump to it. The owner names the counterpart;
  // a provider (messaging the poster) is the initiator, so no id is needed.
  const openThread = async (withUserId?: string) => {
    if (!taskId) return;
    try {
      const cid = await openConversation("task", taskId, withUserId);
      navigate(`/messages/${cid}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      {params.get("posted") ? (
        <div className="card mb-4 border-green-300 bg-green-50 dark:bg-green-900/20">
          <p className="font-medium">Your task is live! Share this link:</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-sm">{task.share_url}</code>
            <button onClick={copyShareUrl} className="btn-secondary !py-2 text-sm">{copied ? "Copied ✓" : "Copy link"}</button>
          </div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <div className="mt-1"><StatusChip status={task.status} kind="task" /></div>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {task.category_name} · {task.town || task.county} {task.timeframe ? `· ${task.timeframe}` : ""}
        {task.budget_cents !== null ? ` · ${money(task.budget_cents)}` : ""}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{task.description}</p>
      {task.location_note ? <p className="mt-2 text-sm text-gray-500">Area: {task.location_note}</p> : null}

      {(() => {
        const images = files.filter((f) => f.content_type.startsWith("image/")).slice(0, 4);
        const others = files.filter((f) => !f.content_type.startsWith("image/"));
        return (
          <>
            {images.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {images.map((f) => (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={`/api/files/${f.id}`}
                      alt={f.filename || "Task photo"}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg border border-gray-200 object-cover dark:border-gray-800"
                    />
                  </a>
                ))}
              </div>
            ) : null}
            {others.length ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {others.map((f) => (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 underline">
                    {f.filename || "View file"}
                  </a>
                ))}
              </div>
            ) : null}
          </>
        );
      })()}

      {/* Respond — only for a signed-in non-owner. The "Do jobs" lens shows the form;
          the "Get help" lens shows a one-tap nudge to switch so the form makes sense. */}
      {!me ? (
        <p className="mt-6 text-sm text-gray-500"><Link to="/login" className="text-brand-600 underline">Sign in</Link> to respond to this job.</p>
      ) : isOwner ? (
        <p className="mt-6 text-sm text-gray-500">
          {responses.length === 0
            ? "This is your task. We're notifying matching providers nearby — responses will appear here as they come in."
            : "This is your task. Review the bids below and hire a provider."}
        </p>
      ) : !canRespond ? (
        <p className="mt-6 text-sm text-gray-500">This task is no longer open for new bids.</p>
      ) : mode === "provider" ? (
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
        <div className="card mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">Want to do this job?</p>
          <button onClick={() => setMode("provider")} className="btn-primary mt-3">Switch to Do jobs to respond</button>
        </div>
      )}

      {/* Bids (owner sees all + can select; a provider sees only their own) */}
      {responses.length ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{isOwner ? "Bids" : "Your bid"} ({responses.length})</h2>
            {ownerView ? (
              <select className="input !w-auto !py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "price")}>
                <option value="newest">Newest</option>
                <option value="price">Price (low→high)</option>
              </select>
            ) : null}
          </div>
          {ownerView && error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-3 space-y-3">
            {sorted.map((r) => {
              const isWinner = task.selected_response_id === r.id;
              return (
              <div key={r.id} className={`card ${isWinner ? "border-green-400 dark:border-green-600" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.provider.name || "Provider"} {r.provider.town ? `· ${r.provider.town}` : ""}</p>
                    {r.provider.provider_bio ? <p className="text-xs text-gray-500">{r.provider.provider_bio}</p> : null}
                  </div>
                  {r.quote_cents !== null ? <span className="font-semibold text-brand-600">{money(r.quote_cents)}</span> : null}
                </div>
                {isWinner ? (
                  <p className="mt-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      {ownerView ? "✓ Hired" : "🎉 You were hired"}
                    </span>
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ownerView ? (
                    <button onClick={() => openThread(r.provider.id)} className="btn-secondary !py-2 text-sm">Message</button>
                  ) : (
                    <button onClick={() => openThread()} className="btn-secondary !py-2 text-sm">Message the poster</button>
                  )}
                  {ownerView && task.status === "open" ? (
                    <button onClick={() => select(r)} disabled={selecting !== null} className="btn-primary !py-2 text-sm disabled:opacity-60">
                      {selecting === r.id ? "Hiring…" : "Hire this provider"}
                    </button>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
