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
  const navItem = "px-3 py-2 rounded-lg text-sm";
  const active = "bg-brand-500 text-white";
  const idle = "hover:bg-gray-100 dark:hover:bg-gray-800";

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin" className="font-bold text-brand-600">BidNeighbor Admin</Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/admin" end className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Dashboard</NavLink>
            <NavLink to="/admin/users" className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Users</NavLink>
            <NavLink to="/admin/tasks" className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Tasks</NavLink>
            <NavLink to="/admin/resources" className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Resources</NavLink>
            <NavLink to="/admin/integrations" className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Integrations</NavLink>
            <NavLink to="/admin/audit" className={({ isActive }) => `${navItem} ${isActive ? active : idle}`}>Audit</NavLink>
            <Link to="/" className={`${navItem} ${idle}`}>← Back to app</Link>
            <ThemeToggle />
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
