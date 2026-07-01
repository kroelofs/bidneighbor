import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { ModeProvider, type Mode } from "./lib/mode";
import { Layout } from "./components/Layout";
import { useMe } from "./lib/useMe";
import { api } from "./lib/api";
import Home from "./pages/Home";
import Login from "./pages/Login";
import PostTask from "./pages/PostTask";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import MyTasks from "./pages/MyTasks";
import Provider from "./pages/Provider";
import ProviderProfile from "./pages/ProviderProfile";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";
import Providers from "./pages/Providers";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import SmsPolicy from "./pages/SmsPolicy";
import Liability from "./pages/Liability";

export default function App() {
  const { me, impersonating, loading, refresh } = useMe();

  const persistTheme = (t: "light" | "dark") => {
    if (me) api.patch("/api/me", { theme_preference: t }).catch(() => {});
  };
  const persistMode = (m: Mode) => {
    if (me) api.patch("/api/me", { last_mode: m }).catch(() => {});
  };

  return (
    <ThemeProvider onPersist={persistTheme} reconcileTo={me?.theme_preference ?? null}>
      <ModeProvider onPersist={persistMode} reconcileTo={me?.last_mode ?? null}>
        <Layout me={me} impersonating={impersonating} onRefresh={refresh}>
          {loading ? (
            <p className="py-12 text-center text-gray-500">Loading…</p>
          ) : (
            <Routes>
              <Route path="/" element={<Home me={me} onChange={refresh} />} />
              <Route path="/login" element={<Login />} />
              <Route path="/post-task" element={<PostTask me={me} onChange={refresh} />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/tasks/:id" element={<TaskDetail me={me} />} />
              <Route path="/my-tasks" element={<MyTasks me={me} />} />
              <Route path="/provider" element={<Provider me={me} onChange={refresh} />} />
              <Route path="/provider/profile" element={<ProviderProfile me={me} onChange={refresh} />} />
              <Route path="/settings" element={<Settings me={me} onChange={refresh} />} />
              <Route path="/messages" element={<Messages me={me} />} />
              <Route path="/messages/:id" element={<Messages me={me} />} />
              <Route path="/providers" element={<Providers />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/sms-policy" element={<SmsPolicy />} />
              <Route path="/liability" element={<Liability />} />
              <Route path="*" element={<p className="py-12 text-center">Page not found.</p>} />
            </Routes>
          )}
        </Layout>
      </ModeProvider>
    </ThemeProvider>
  );
}
