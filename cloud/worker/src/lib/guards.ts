import type { AuthContext } from "../types";

export function isAdmin(auth: AuthContext | null): boolean {
  return !!auth && auth.user.admin_level !== null;
}

/** Admins who may impersonate / hard-moderate. platform_manager is read-mostly. */
export function canImpersonate(auth: AuthContext | null): boolean {
  return !!auth && (auth.user.admin_level === "admin" || auth.user.admin_level === "superadmin");
}

export function isSuspended(auth: AuthContext | null): boolean {
  return !!auth && auth.user.status === "suspended";
}

/** True if the current session is an admin impersonating someone else. */
export function isImpersonating(auth: AuthContext | null): boolean {
  return !!auth && auth.session.impersonator_id !== null;
}
