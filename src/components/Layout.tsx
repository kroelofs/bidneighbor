import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { UserMenu } from "./UserMenu";
import { GeoConsent } from "./GeoConsent";
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

export function Layout({
  children,
  me,
  impersonating,
}: {
  children: ReactNode;
  me: Me | null;
  impersonating?: { by_admin_name: string | null } | null;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {impersonating ? <ImpersonationBanner adminName={impersonating.by_admin_name} /> : null}
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand-600 dark:text-brand-500">
            BidNeighbor
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/tasks" className="px-2 py-1 hover:underline">Browse</Link>
            <Link to="/post-task" className="px-2 py-1 hover:underline">Post a task</Link>
            {me ? (
              <>
                <Link to="/my-tasks" className="px-2 py-1 hover:underline">My tasks</Link>
                <Link to="/provider" className="px-2 py-1 hover:underline">Provider</Link>
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
      <GeoConsent />
    </div>
  );
}
