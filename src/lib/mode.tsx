import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Me } from "./api";

/** The UI lens. "neighbor" = get-help view (post tasks); "provider" = do-jobs view. */
export type Mode = "neighbor" | "provider";

const STORAGE_KEY = "bn_mode";

interface ModeCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
}

const Ctx = createContext<ModeCtx | null>(null);

function readInitial(): Mode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "provider" ? "provider" : "neighbor";
  } catch {
    return "neighbor";
  }
}

/**
 * Mode provider. Source-of-truth precedence mirrors ThemeProvider:
 *  1. localStorage (instant, works pre-login on the public homepage)
 *  2. the logged-in user's saved `last_mode`, reconciled via `reconcileTo`
 * Switching persists to localStorage immediately and calls `onPersist` (PATCH /api/me).
 * Mode is a UI lens only — never an authorization boundary; the API still enforces
 * every action server-side.
 */
export function ModeProvider({
  children,
  onPersist,
  reconcileTo,
}: {
  children: ReactNode;
  onPersist?: (m: Mode) => void;
  /** The logged-in user's saved last_mode; adopted without persisting back. */
  reconcileTo?: Mode | null;
}) {
  const [mode, setModeState] = useState<Mode>(readInitial);

  // Adopt the server's saved value once it arrives (no PATCH back).
  useEffect(() => {
    if (reconcileTo && reconcileTo !== mode) setModeState(reconcileTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileTo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore (private mode) */
    }
  }, [mode]);

  const setMode = (m: Mode) => {
    if (m === mode) return;
    setModeState(m);
    onPersist?.(m);
  };
  const toggle = () => setMode(mode === "provider" ? "neighbor" : "provider");

  return <Ctx.Provider value={{ mode, setMode, toggle }}>{children}</Ctx.Provider>;
}

export function useMode(): ModeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMode must be used inside ModeProvider");
  return ctx;
}

/**
 * Whether a user has finished the quick provider setup (county + at least one
 * category). Subscribing to categories flips `role` to "provider" server-side, so
 * role is a zero-cost proxy that avoids an extra query on the hot /api/me path.
 * Admins can do anything, so they're always considered set up.
 */
export function providerSetupComplete(me: Me | null): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  return me.role === "provider" && !!me.county;
}
