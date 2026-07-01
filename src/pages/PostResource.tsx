import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type ResourceDetail, type Me } from "../lib/api";
import { compressImage } from "../lib/image";

export default function PostResource({ me }: { me: Me | null }) {
  const { id } = useParams(); // present → edit mode
  const editing = !!id;
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [town, setTown] = useState(me?.town ?? "");
  const [county, setCounty] = useState(me?.county ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ resource: ResourceDetail }>(`/api/resources/${id}`).then((d) => {
      const r = d.resource;
      if (!r.is_owner) { navigate(`/resources/${id}`); return; }
      setTitle(r.title); setDescription(r.description);
      setRate(r.daily_rate_cents !== null ? String(r.daily_rate_cents / 100) : "");
      setDeposit(r.deposit_cents !== null ? String((r.deposit_cents ?? 0) / 100) : "");
      setTown(r.town ?? ""); setCounty(r.county ?? "");
    }).catch(() => {});
  }, [id, navigate]);

  if (!me) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium">Please sign in to list equipment.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const payload = { title, description, daily_rate: rate, deposit, town, county };
    try {
      let resourceId = id;
      if (editing) {
        await api.patch(`/api/resources/${id}`, payload);
      } else {
        const d = await api.post<{ id: string }>("/api/resources", payload);
        resourceId = d.id;
      }
      for (const file of photos) {
        const image = await compressImage(file); // shrink oversized photos so the upload fits
        const form = new FormData();
        form.append("file", image);
        await api.upload(`/api/resources/${resourceId}/files`, form).catch(() => {});
      }
      navigate(`/resources/${resourceId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{editing ? "Edit listing" : "List your equipment"}</h1>
      <p className="mt-1 text-sm text-gray-500">Help a neighbor's DIY project and earn from gear that's just sitting there.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? (e.g. Gas pressure washer)" />
        <textarea className="input min-h-28" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe it — condition, what it's good for, pickup details." />
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Daily rate ($)" />
          <input className="input flex-1" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit ($, optional)" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" value={town} onChange={(e) => setTown(e.target.value)} placeholder="Town" />
          <input className="input flex-1" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="County" />
        </div>
        <div>
          <label className="block text-sm font-medium">Photos {editing ? "(add more)" : ""}</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} className="mt-1 text-sm" />
          {photos.length ? <p className="mt-1 text-xs text-gray-500">{photos.length} photo{photos.length > 1 ? "s" : ""} selected</p> : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="btn-primary disabled:opacity-60" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Post listing"}
        </button>
      </form>
    </div>
  );
}
