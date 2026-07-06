import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Category, type Me } from "../lib/api";
import { COUNTIES, DEFAULT_COUNTY } from "../lib/geo";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { loadGeo } from "../lib/geoConsent";

export default function ProviderProfile({ me, onChange }: { me: Me | null; onChange: () => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState({
    name: "", phone: "", county: DEFAULT_COUNTY, town: "", street_address: "", city: "", state: "", zip: "", provider_bio: "",
    latitude: null as number | null, longitude: null as number | null,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
    api.get<{ category_ids: string[] }>("/api/provider/categories").then((d) => setSelected(new Set(d.category_ids))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!me) return;
    // Saved value wins; otherwise pre-fill city/state/zip from consented edge geo.
    const geo = loadGeo();
    setProfile({
      name: me.name ?? "",
      phone: me.phone ?? "",
      county: me.county ?? DEFAULT_COUNTY,
      town: me.town ?? "",
      street_address: me.street_address ?? "",
      city: me.city ?? geo?.city ?? "",
      state: me.state ?? geo?.state ?? "",
      zip: me.zip ?? geo?.zip ?? "",
      provider_bio: me.provider_bio ?? "",
      latitude: me.latitude,
      longitude: me.longitude,
    });
  }, [me]);

  if (!me) return <p className="text-gray-500"><Link to="/login" className="text-brand-600 underline">Sign in</Link> first.</p>;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.patch("/api/me", profile);
    await api.put("/api/provider/categories", { category_ids: Array.from(selected) });
    setSaved(true);
    onChange();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Provider profile</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Set your area and pick the categories you want job alerts for.</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Name</label><input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
          <div><label className="label">Phone (private)</label><input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">County</label>
            <select className="input" value={profile.county} onChange={(e) => setProfile({ ...profile, county: e.target.value })}>
              {COUNTIES.map((c) => <option key={c.county}>{c.county}</option>)}
            </select>
          </div>
          <div><label className="label">Town</label><input className="input" value={profile.town} onChange={(e) => setProfile({ ...profile, town: e.target.value })} /></div>
        </div>
        <AddressAutocomplete
          label="Search your address (autofill)"
          onSelect={(a) => setProfile({ ...profile, ...a })}
        />
        <div>
          <label className="label">Street address (private)</label>
          <input className="input" value={profile.street_address} onChange={(e) => setProfile({ ...profile, street_address: e.target.value })} placeholder="123 Main St" />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <div className="col-span-3"><label className="label">City</label><input className="input" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></div>
          <div className="col-span-1"><label className="label">State</label><input className="input" maxLength={2} value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value.toUpperCase() })} placeholder="IA" /></div>
          <div className="col-span-2"><label className="label">ZIP</label><input className="input" inputMode="numeric" maxLength={10} value={profile.zip} onChange={(e) => setProfile({ ...profile, zip: e.target.value })} /></div>
        </div>
        <p className="text-xs text-gray-500">Your public directory listing shows only your name, city, state, and ZIP — never your street address or phone.</p>
        <div><label className="label">Short bio</label><textarea className="input" value={profile.provider_bio} onChange={(e) => setProfile({ ...profile, provider_bio: e.target.value })} placeholder="What you do, experience, etc." /></div>

        <div>
          <label className="label">Categories you want alerts for</label>
          <div className="grid grid-cols-2 gap-2">
            {cats.map((c) => (
              <label key={c.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${selected.has(c.id) ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20" : "border-gray-300 dark:border-gray-700"}`}>
                <input type="checkbox" className="mr-2" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full">{saved ? "Saved ✓" : "Save profile"}</button>
      </form>
    </div>
  );
}
