import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, type ConversationSummary, type Me } from "../lib/api";
import MessageThread from "../components/MessageThread";

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Messages({ me }: { me: Me | null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadInbox = () => {
    api.get<{ conversations: ConversationSummary[] }>("/api/conversations")
      .then((d) => { setConvos(d.conversations); setLoaded(true); })
      .catch(() => setLoaded(true));
  };

  useEffect(() => { if (me) loadInbox(); }, [me, id]);

  if (!me) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium">Please sign in to see your messages.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </div>
    );
  }

  // Thread view
  if (id) {
    const active = convos.find((c) => c.id === id);
    return (
      <div className="mx-auto flex h-[70dvh] max-w-2xl flex-col">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => navigate("/messages")} className="text-sm text-brand-600 hover:underline">← All messages</button>
          {active ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{active.other_party.name || "Neighbor"}</p>
              {active.subject_label ? <p className="truncate text-xs text-gray-500">{active.subject_label}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="card flex-1 overflow-hidden">
          <MessageThread conversationId={id} onActivity={loadInbox} />
        </div>
      </div>
    );
  }

  // Inbox view
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Messages</h1>
      <p className="mt-1 text-sm text-gray-500">Private conversations about your tasks. Only you and the other person can see them.</p>

      {!loaded ? (
        <p className="py-12 text-center text-gray-500">Loading…</p>
      ) : convos.length === 0 ? (
        <div className="card mt-4 text-center text-sm text-gray-500">
          No messages yet. When you respond to a job — or someone responds to yours — you can start a private conversation here.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {convos.map((c) => (
            <Link
              key={c.id}
              to={`/messages/${c.id}`}
              className="card flex items-center justify-between gap-3 transition hover:border-brand-300"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {c.other_party.name || "Neighbor"}
                  {c.unread > 0 ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">{c.unread}</span>
                  ) : null}
                </p>
                {c.subject_label ? <p className="truncate text-sm text-gray-500">{c.subject_label}</p> : null}
              </div>
              <span className="shrink-0 text-xs text-gray-400">{timeLabel(c.last_message_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
