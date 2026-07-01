import { useEffect, useRef, useState } from "react";
import { api, type Message, type ThreadView } from "../lib/api";

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
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    api.get<ThreadView>(`/api/conversations/${conversationId}/messages`)
      .then((d) => { setMessages(d.messages); setLoaded(true); onActivity?.(); })
      .catch(() => { setNotFound(true); setLoaded(true); });
  };

  useEffect(() => {
    setLoaded(false); setNotFound(false); setMessages([]);
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

  if (!loaded) return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  if (notFound) return <p className="py-8 text-center text-sm text-gray-500">This conversation isn't available.</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No messages yet. Say hello 👋</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.mine ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-800"}`}>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.mine ? "text-white/70" : "text-gray-400"}`}>{timeLabel(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <textarea
          className="input min-h-11 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <button className="btn-primary shrink-0" disabled={sending || !text.trim()}>Send</button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
