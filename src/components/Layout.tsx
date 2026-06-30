import { useState } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { UserMenu } from "./UserMenu";
import { GeoConsent } from "./GeoConsent";
import { ModeSwitch } from "./ModeSwitch";
import ProviderSetup from "./ProviderSetup";
import { useMode } from "../lib/mode";
import { type Me } from "../lib/api";

const APP_ORIGIN = "https://app.bidneighbor.com";

/** Sign-in always lands on the app host. On the app host itself (or local dev) use a
 *  relative path; anywhere else, an absolute URL to app.bidneighbor.com. */
function loginHref(): string {
  if (typeof window === "undefined") return "/login";
  const h = window.location.hostname;
  const onApp = h === "app.bidneighbor.com" || h === "localhost" || h === "127.0.0.1";
  return onApp ? "/login" : `${APP_ORIGIN}/login`;
}

/** Nav links for the signed-in user, by mode. Each lens shows only its own tools. */
function navLinks(mode: "neighbor" | "provider"): { to: string; label: string }[] {
  return mode === "provider"
    ? [
        { to: "/provider", label: "Find work" },
        { to: "/my-tasks", label: "My tasks" },
        { to: "/provider/profile", label: "My profile" },
      ]
    : [
        { to: "/post-task", label: "Post a task" },
        { to: "/my-tasks", label: "My tasks" },
        { to: "/tasks", label: "Browse" },
      ];
}

export function Layout({
  children,
  me,
  impersonating,
  onRefresh,
}: {
  children: ReactNode;
  me: Me | null;
  impersonating?: { by_admin_name: string | null } | null;
  onRefresh?: () => void;
}) {
  const { mode, setMode } = useMode();
  const [setupOpen, setSetupOpen] = useState(false);

  const links = me ? navLinks(mode) : [];

  return (
    <div className="flex min-h-screen flex-col">
      {impersonating ? <ImpersonationBanner adminName={impersonating.by_admin_name} /> : null}
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand-600 dark:text-brand-500">
            BidNeighbor
          </Link>
          {/* The mode switch is the primary way to flip between the two views. On
              desktop it sits in the header; on mobile it drops to its own row below. */}
          <div className="hidden sm:block">
            <ModeSwitch me={me} onRequireSetup={() => setSetupOpen(true)} />
          </div>
          <nav className="flex items-center gap-2 text-sm">
            {me ? (
              <>
                {links.map((l) => (
                  <Link key={l.to} to={l.to} className="hidden px-2 py-1 hover:underline sm:inline">
                    {l.label}
                  </Link>
                ))}
                <ThemeToggle />
                <UserMenu me={me} />
              </>
            ) : (
              <>
                <ThemeToggle />
                <a href={loginHref()} className="btn-primary !px-4 !py-2 !text-sm">Sign in</a>
              </>
            )}
          </nav>
        </div>
        {/* Mobile: mode switch + the current lens's links on their own rows. */}
        <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-800 sm:hidden">
          <ModeSwitch me={me} onRequireSetup={() => setSetupOpen(true)} className="w-full justify-center" />
          {me ? (
            <nav className="mt-2 flex items-center justify-center gap-4 text-sm">
              {links.map((l) => (
                <Link key={l.to} to={l.to} className="py-1 hover:underline">
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      <footer className="mt-12 border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row">
          <p>© {new Date().getFullYear()} BidNeighbor</p>
          <nav className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/providers" className="hover:underline">Find providers</Link>
            <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="hover:underline">Terms of Service</Link>
            <Link to="/sms-policy" className="hover:underline">SMS Policy</Link>
          </nav>
        </div>
      </footer>
      {setupOpen && me ? (
        <ProviderSetup
          me={me}
          onClose={() => setSetupOpen(false)}
          onComplete={() => {
            setSetupOpen(false);
            onRefresh?.();   // pull the now-provider account so the gate stays satisfied
            setMode("provider");
          }}
        />
      ) : null}
      <GeoConsent />
    </div>
  );
}
