import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readInitial(): Theme {
  try {
    // Default is LIGHT. We deliberately do not consult prefers-color-scheme.
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Theme provider. Source of truth precedence:
 *  1. localStorage (instant, works pre-login on the public homepage)
 *  2. the logged-in user's saved preference, reconciled via onReconcile()
 * Toggling persists to localStorage immediately and calls onPersist (PATCH /api/me).
 */
export function ThemeProvider({
  children,
  onPersist,
  reconcileTo,
}: {
  children: ReactNode;
  onPersist?: (t: Theme) => void;
  /** The logged-in user's saved preference; reconciled in without re-persisting. */
  reconcileTo?: Theme | null;
}) {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  // When the server tells us the user's saved preference, adopt it (no PATCH back).
  useEffect(() => {
    if (reconcileTo && reconcileTo !== theme) setThemeState(reconcileTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileTo]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    onPersist?.(t);
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
