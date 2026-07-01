import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export interface AddressFields {
  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
}

interface Suggestion {
  placeId: string;
  description: string;
}

/**
 * Type-ahead address search backed by the Google Places proxy (/api/places/*).
 * On selection it fetches Place Details and hands the parent the structured
 * address + coordinates via onSelect; the parent owns the editable fields.
 */
export default function AddressAutocomplete({
  onSelect,
  label = "Search your address",
}: {
  onSelect: (a: AddressFields) => void;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // One session token groups the keystrokes + the details call into a single
  // billable Places session; reset it after each pick.
  const sessionRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const d = await api.post<{ suggestions: Suggestion[] }>("/api/places/autocomplete", {
          input: q,
          sessionToken: sessionRef.current,
        });
        setSuggestions(d.suggestions);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const choose = async (s: Suggestion) => {
    setBusy(true);
    setErr(null);
    setOpen(false);
    setQ(s.description);
    try {
      const d = await api.get<{ address: AddressFields }>(
        `/api/places/details?placeId=${encodeURIComponent(s.placeId)}&sessionToken=${encodeURIComponent(sessionRef.current)}`,
      );
      onSelect(d.address);
    } catch {
      // Details lookup failed — tell the user so they know to fill the fields below
      // by hand rather than staring at a search box that "filled in" but did nothing.
      setErr("Couldn't load that address automatically — please enter it in the fields below.");
    } finally {
      setBusy(false);
      sessionRef.current = crypto.randomUUID(); // start a fresh billing session
    }
  };

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Start typing your address…"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
      {busy && <p className="mt-1 text-xs text-gray-500">Filling in address…</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
