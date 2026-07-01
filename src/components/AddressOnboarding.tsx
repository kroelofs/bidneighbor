import { useState } from "react";
import { api, type Me } from "../lib/api";
import { useMode } from "../lib/mode";
import AddressAutocomplete, { type AddressFields } from "./AddressAutocomplete";

const DISMISS_KEY = "bn_address_prompt_dismissed";

const EMPTY: AddressFields = { street_address: "", city: "", state: "", zip: "", latitude: null, longitude: null };

/**
 * One-time, dismissible prompt shown to a logged-in user who has no street address
 * on file. Mounted contextually (the "Post a task" flow and the provider dashboard),
 * not app-wide, so it only asks when an address is actually useful. Optional — "Not
 * now" stores a local flag so we don't nag on every load. Copy is tailored to the
 * current UI lens: "neighbor" (get help) speaks about nearby providers, "provider"
 * (do jobs) speaks about nearby jobs. Saving fills the same user.address fields the
 * provider profile uses.
 */
export default function AddressOnboarding({ me, onSaved }: { me: Me | null; onSaved: () => void }) {
  const { mode } = useMode();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [addr, setAddr] = useState<AddressFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!me || me.street_address || dismissed) return null;

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore (private mode) */
    }
    setDismissed(true);
  };

  const skip = () => remember();

  const set = (k: keyof AddressFields, v: string) => setAddr((a) => ({ ...a, [k]: v }));

  const ready = addr.street_address.trim() && addr.city.trim() && addr.state.trim() && addr.zip.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch("/api/me", addr);
      remember();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save your address");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md bg-white p-6 dark:bg-gray-900">
        <h2 className="text-xl font-bold">Add your address</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {mode === "provider"
            ? "We use it to match you with nearby jobs. Your street address stays private — customers only ever see your city, state, and ZIP."
            : "We use it to match you with nearby providers. Your street address stays private — public listings show only your city, state, and ZIP."}
        </p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <AddressAutocomplete onSelect={(a) => setAddr(a)} />
          <div>
            <label className="label">Street address</label>
            <input className="input" value={addr.street_address} onChange={(e) => set("street_address", e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3"><label className="label">City</label><input className="input" value={addr.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div className="col-span-1"><label className="label">State</label><input className="input" maxLength={2} value={addr.state} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="IA" /></div>
            <div className="col-span-2"><label className="label">ZIP</label><input className="input" inputMode="numeric" maxLength={10} value={addr.zip} onChange={(e) => set("zip", e.target.value)} /></div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1 disabled:opacity-60" disabled={busy || !ready}>
              {busy ? "Saving…" : "Save address"}
            </button>
            <button type="button" className="px-3 py-2 text-sm text-gray-500 hover:underline" onClick={skip}>
              Not now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
