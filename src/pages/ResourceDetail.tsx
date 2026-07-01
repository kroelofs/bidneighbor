import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, money, resourceFileUrl, openConversation, type ResourceDetail as ResourceDetailT, type Me } from "../lib/api";

export default function ResourceDetail({ me }: { me: Me | null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState<ResourceDetailT | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ resource: ResourceDetailT }>(`/api/resources/${id}`)
      .then((d) => { setR(d.resource); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <p className="text-gray-500">Loading…</p>;
  if (!r) return <p className="text-gray-500">This listing isn't available.</p>;

  const ask = async () => {
    if (!id) return;
    try {
      const cid = await openConversation("resource", id);
      navigate(`/messages/${cid}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const report = async () => {
    if (!id) return;
    const reason = window.prompt("What's wrong with this listing?") ?? "";
    try {
      await api.post(`/api/resources/${id}/report`, { reason });
      setReported(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm("Remove this listing?")) return;
    await fetch(`/api/resources/${id}`, { method: "DELETE", credentials: "include" }).catch(() => {});
    navigate("/resources");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/resources" className="text-sm text-brand-600 hover:underline">← All resources</Link>

      {r.files.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {r.files.map((f) => (
            <a key={f.id} href={resourceFileUrl(r.id, f.id)} target="_blank" rel="noreferrer">
              <img src={resourceFileUrl(r.id, f.id)} alt={r.title} loading="lazy"
                className="aspect-square w-full rounded-lg border border-gray-200 object-cover dark:border-gray-800" />
            </a>
          ))}
        </div>
      ) : null}

      <h1 className="mt-4 text-2xl font-bold">{r.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {r.town || r.county}{r.owner?.name ? ` · ${r.owner.name}` : ""}
        {r.status !== "active" ? ` · ${r.status}` : ""}
      </p>
      <p className="mt-2 font-semibold text-brand-600">
        {r.daily_rate_cents !== null ? <>{money(r.daily_rate_cents)}<span className="text-sm font-normal text-gray-500">/day</span></> : "Ask about pricing"}
        {r.deposit_cents ? <span className="ml-3 text-sm font-normal text-gray-500">Deposit: {money(r.deposit_cents)}</span> : null}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{r.description}</p>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {r.is_owner ? (
          <>
            <Link to={`/resources/${r.id}/edit`} className="btn-secondary">Edit</Link>
            <button onClick={remove} className="btn-secondary">Remove</button>
          </>
        ) : me ? (
          <button onClick={ask} className="btn-primary">Ask about this</button>
        ) : (
          <Link to="/login" className="btn-primary">Sign in to ask about this</Link>
        )}
        {!r.is_owner && me ? (
          reported ? <span className="self-center text-sm text-gray-500">Reported — thank you</span>
            : <button onClick={report} className="self-center text-sm text-gray-500 hover:underline">Report</button>
        ) : null}
      </div>
    </div>
  );
}
