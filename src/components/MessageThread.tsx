import { useEffect, useRef, useState } from "react";
import { api, money, messageFileUrl, sendMessageImage, type Message, type ThreadContext, type ThreadView } from "../lib/api";
import { compressImage } from "../lib/image";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * A private two-party thread. Loads on mount, gently polls for new messages, and
 * posts through the sanitized/rate-limited API. Bodies are rendered as text.
 */
export default function MessageThread({ conversationId, onActivity }: { conversationId: string; onActivity?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<ThreadContext | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get<ThreadView>(`/api/conversations/${conversationId}/messages`)
      .then((d) => { setMessages(d.messages); setContext(d.context); setLoaded(true); onActivity?.(); })
      .catch(() => { setNotFound(true); setLoaded(true); });
  };

  useEffect(() => {
    setLoaded(false); setNotFound(false); setMessages([]); setContext(null);
    load();
    const t = setInterval(load, 15000); // gentle poll while the thread is open
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try {
      await api.post(`/api/conversations/${conversationId}/messages`, { body });
      setText("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || sending) return;
    setSending(true); setError(null);
    try {
      const image = await compressImage(file); // shrink oversized photos so the upload fits
      await sendMessageImage(conversationId, image, text.trim() || undefined);
      setText("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!loaded) return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  if (notFound) return <p className="py-8 text-center text-sm text-gray-500">This conversation isn't available.</p>;

  return (
    <div className="flex h-full flex-col">
      {context ? (
        <div className="mb-2 shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/40">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Their response
            {context.quote_cents !== null ? <span className="ml-2 text-brand-600">{money(context.quote_cents)}</span> : null}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{context.message}</p>
        </div>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No messages yet. Say hello 👋</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.mine ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-800"}`}>
                {m.files.map((f) => (
                  <a key={f.id} href={messageFileUrl(conversationId, f.id)} target="_blank" rel="noreferrer" className="mb-1 block">
                    <img
                      src={messageFileUrl(conversationId, f.id)}
                      alt="Shared image"
                      loading="lazy"
                      className="max-h-64 max-w-full rounded-lg border border-black/10 object-cover"
                    />
                  </a>
                ))}
                {m.body ? <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p> : null}
                <p className={`mt-1 text-[10px] ${m.mine ? "text-white/70" : "text-gray-400"}`}>{timeLabel(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={pickImage}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          title="Send an image"
          aria-label="Send an image"
          className="btn-secondary shrink-0 !px-3 disabled:opacity-60"
        >
          📷
        </button>
        <textarea
          className="input min-h-11 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <button className="btn-primary shrink-0 !px-4 sm:!px-5" disabled={sending || !text.trim()}>Send</button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
