import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Me } from "../lib/api";
import { ADMIN_ORIGIN } from "../lib/config";

function initials(me: Me): string {
  const base = (me.name || me.email || "?").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function Avatar({ me }: { me: Me }) {
  if (me.avatar_url) {
    return <img src={me.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
      {initials(me)}
    </span>
  );
}

export function UserMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const logout = async () => {
    await api.post("/api/logout").catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full p-0.5 hover:ring-2 hover:ring-brand-500"
      >
        <Avatar me={me} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <p className="truncate text-sm font-medium">{me.name || "Account"}</p>
            <p className="truncate text-xs text-gray-500">{me.email}</p>
          </div>
          <Link
            to="/provider/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Edit profile
          </Link>
          <Link
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Settings
          </Link>
          {me.admin_level !== null ? (
            <a
              href={ADMIN_ORIGIN}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block border-t border-gray-100 px-4 py-2.5 text-sm font-medium text-brand-600 hover:bg-gray-50 dark:border-gray-800 dark:text-brand-400 dark:hover:bg-gray-800"
            >
              Admin
            </a>
          ) : null}
          <button
            role="menuitem"
            onClick={logout}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
