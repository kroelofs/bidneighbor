import { Routes, Route, Link, NavLink } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import type { Me } from "../lib/api";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import AdminTasks from "./pages/AdminTasks";
import AdminResources from "./pages/AdminResources";
import AuditLog from "./pages/AuditLog";
import Integrations from "./pages/Integrations";

// Rendered by App at /admin/* (same SPA, same session). `me` + `loading` come from
// App's useMe(), so there's no second /api/me fetch and ThemeProvider stays at the App root.
export default function AdminApp({ me, loading }: { me: Me | null; loading: boolean }) {
  const navItem = "whitespace-nowrap rounded-lg px-3 py-2 text-sm";
  const active = "bg-brand-500 text-white";
  const idle = "hover:bg-gray-100 dark:hover:bg-gray-800";

  const tabs: { to: string; label: string; end?: boolean }[] = [
    { to: "/admin", label: "Dashboard", end: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/tasks", label: "Tasks" },
    { to: "/admin/resources", label: "Resources" },
    { to: "/admin/integrations", label: "Integrations" },
    { to: "/admin/audit", label: "Audit" },
  ];

  // Shared tab list — rendered inline in the header on desktop, and in a
  // horizontally-scrollable row below the logo on mobile so the six tabs plus
  // "Back to app" never overflow a ~360px phone.
  const renderTabs = () => (
    <>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>
          {t.label}
        </NavLink>
      ))}
      <Link to="/" className={`${navItem} ${idle}`}>← Back to app</Link>
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/admin" className="whitespace-nowrap font-bold text-brand-600">BidNeighbor Admin</Link>
            {/* Desktop: tabs + toggle inline on one row. */}
            <nav className="hidden items-center gap-1 sm:flex">
              {renderTabs()}
              <ThemeToggle />
            </nav>
            {/* Mobile: keep only the toggle up top; tabs move to the row below. */}
            <div className="sm:hidden">
              <ThemeToggle />
            </div>
          </div>
          {/* Mobile: scrollable tab row. -mx-4/px-4 lets it bleed to the screen edges. */}
          <nav className="-mx-4 mt-2 flex items-center gap-1 overflow-x-auto px-4 pb-1 sm:hidden">
            {renderTabs()}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {loading ? (
          <p className="py-12 text-center text-gray-500">Loading…</p>
        ) : !me || me.admin_level === null ? (
          <div className="card mx-auto max-w-md text-center">
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              This area is restricted to administrators, and your account doesn't have an admin role.
            </p>
            <Link to="/" className="btn-primary mt-4 inline-block">Back to app</Link>
          </div>
        ) : (
          <Routes>
            <Route path="" element={<Dashboard />} />
            <Route path="users" element={<Users me={me} />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="resources" element={<AdminResources />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="audit" element={<AuditLog />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
