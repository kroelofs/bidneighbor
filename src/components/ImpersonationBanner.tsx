import { api } from "../lib/api";

/** Non-dismissible banner shown whenever an admin is impersonating a user. */
export function ImpersonationBanner({ adminName }: { adminName: string | null }) {
  const stop = async () => {
    try {
      const res = await api.post<{ return_to: string }>("/api/auth/stop-impersonation");
      window.location.href = res.return_to || "/";
    } catch {
      window.location.href = "/";
    }
  };
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <span>
        You are signed in as this user via admin impersonation
        {adminName ? ` (by ${adminName})` : ""}.
      </span>
      <button onClick={stop} className="rounded bg-black/80 px-3 py-1 text-white hover:bg-black">
        Return to admin
      </button>
    </div>
  );
}
