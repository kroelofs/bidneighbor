import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { api, type Me } from "../lib/api";

export function Layout({
  children,
  me,
  impersonating,
}: {
  children: ReactNode;
  me: Me | null;
  impersonating?: { by_admin_name: string | null } | null;
}) {
  const logout = async () => {
    await api.post("/api/logout").catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen">
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
                <button onClick={logout} className="px-2 py-1 hover:underline">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="btn-primary !px-4 !py-2 !text-sm">Sign in</Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
