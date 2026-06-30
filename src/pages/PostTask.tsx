import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Category, type Me } from "../lib/api";
import { COUNTIES, DEFAULT_COUNTY, townsForCounty } from "../lib/geo";
import { loadGeo } from "../lib/geoConsent";
import { Turnstile } from "../components/Turnstile";

const MAX_IMAGES = 4;

export default function PostTask({ me }: { me: Me | null; onChange: () => void }) {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    county: DEFAULT_COUNTY,
    town: "",
    location_note: "",
    budget: "",
    timeframe: "Flexible",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
    // If the visitor consented to location and their city is a town we serve, pre-fill it.
    const geo = loadGeo();
    if (geo?.city) {
      setForm((f) => {
        if (f.town) return f;
        const match = townsForCounty(f.county).find((t) => t.toLowerCase() === geo.city!.toLowerCase());
        return match ? { ...f, town: match } : f;
      });
    }
  }, []);

  if (!me) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium">Please sign in to post a task.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </div>
    );
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ id: string; slug: string; share_url: string }>("/api/tasks", { ...form, turnstileToken: token });
      if (files && files.length) {
        for (const file of Array.from(files).slice(0, MAX_IMAGES)) {
          const fd = new FormData();
          fd.set("file", file);
          await api.upload(`/api/tasks/${res.id}/files`, fd).catch(() => {});
        }
      }
      nav(`/tasks/${res.slug}?posted=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Post a task</h1>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label className="label">What do you need done?</label>
          <input className="input" required maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Mow a half-acre yard" />
        </div>
        <div>
          <label className="label">Details</label>
          <textarea className="input min-h-28" required value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the job, size, anything a provider should know." />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" required value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
            <option value="">Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">County</label>
            <select className="input" value={form.county} onChange={(e) => { set("county", e.target.value); set("town", ""); }}>
              {COUNTIES.map((c) => <option key={c.county} value={c.county}>{c.county}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Town</label>
            <select className="input" value={form.town} onChange={(e) => set("town", e.target.value)}>
              <option value="">Choose…</option>
              {townsForCounty(form.county).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Approximate location (kept private)</label>
          <input className="input" maxLength={200} value={form.location_note} onChange={(e) => set("location_note", e.target.value)} placeholder="e.g. North side of town — exact address shared privately" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Budget (optional)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input className="input pl-7" inputMode="decimal" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label">Timeframe</label>
            <select className="input" value={form.timeframe} onChange={(e) => set("timeframe", e.target.value)}>
              {["ASAP", "This week", "This month", "Flexible"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Photos (optional — up to {MAX_IMAGES}, JPG/PNG/WebP/PDF)</label>
          <input className="input" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles(e.target.files)} />
          {files && files.length > MAX_IMAGES ? (
            <p className="mt-1 text-xs text-amber-600">Only the first {MAX_IMAGES} files will be uploaded.</p>
          ) : null}
        </div>
        <Turnstile onToken={setToken} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy || !token} className="btn-primary w-full disabled:opacity-60">
          {busy ? "Posting…" : "Post task"}
        </button>
      </form>
    </div>
  );
}
