import { useNavigate } from "react-router-dom";
import { useMode, providerSetupComplete, type Mode } from "../lib/mode";
import { type Me } from "../lib/api";

const TABS: { mode: Mode; label: string; hint: string }[] = [
  { mode: "neighbor", label: "Get help", hint: "Post a task and get responses" },
  { mode: "provider", label: "Do jobs", hint: "Find work and send quotes" },
];

/**
 * The persistent two-way mode switch. Flipping rewrites the nav, home, and primary
 * action across the app. Switching to "Do jobs" for a signed-in user who hasn't
 * finished provider setup defers to `onRequireSetup` (the quick county+categories
 * flow) instead of dropping them on an empty dashboard.
 */
export function ModeSwitch({
  me,
  onRequireSetup,
  className = "",
}: {
  me: Me | null;
  onRequireSetup: () => void;
  className?: string;
}) {
  const { mode, setMode } = useMode();
  const navigate = useNavigate();

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === "provider" && me && !providerSetupComplete(me)) {
      onRequireSetup();
      return;
    }
    setMode(next);
    // Land on the home of the newly chosen lens so the change is obvious.
    navigate("/");
  };

  return (
    <div
      role="tablist"
      aria-label="Choose what you want to do"
      className={`inline-flex rounded-full border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      {TABS.map((t) => {
        const active = mode === t.mode;
        return (
          <button
            key={t.mode}
            type="button"
            role="tab"
            aria-selected={active}
            title={t.hint}
            onClick={() => switchTo(t.mode)}
            className={`rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 sm:py-1.5 ${
              active
                ? "bg-brand-600 text-white shadow"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
