import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Me } from "../lib/api";

type Tab = "notifications";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </label>
  );
}

export default function Settings({ me, onChange }: { me: Me | null; onChange: () => void }) {
  const [tab] = useState<Tab>("notifications");
  const [newTasks, setNewTasks] = useState(!!me?.notify_new_tasks);
  const [responses, setResponses] = useState(!!me?.notify_responses);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium">Please sign in to manage your settings.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </div>
    );
  }

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.patch("/api/me", { notify_new_tasks: newTasks, notify_responses: responses });
      setSaved(true);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="mt-4 flex gap-6">
        <nav className="w-40 shrink-0 space-y-1 text-sm">
          <span className={`block rounded-md px-3 py-2 font-medium ${tab === "notifications" ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : ""}`}>
            Email notifications
          </span>
        </nav>
        <div className="min-w-0 flex-1">
          <div className="card">
            <h2 className="font-semibold">Email notifications</h2>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">When you're getting help</p>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <Toggle
                checked={responses}
                onChange={(v) => { setResponses(v); setSaved(false); }}
                label="Responses to my tasks"
                hint="Email me when someone responds to a task I posted, or when I select a provider."
              />
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">When you're doing jobs</p>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <Toggle
                checked={newTasks}
                onChange={(v) => { setNewTasks(v); setSaved(false); }}
                label="New jobs near me"
                hint="Email me when a new task is posted in my categories and area."
              />
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-60">
                {busy ? "Saving…" : "Save changes"}
              </button>
              {saved ? <span className="text-sm text-green-600">Saved</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
