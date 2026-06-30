import type { Env, AuthContext } from "../types";
import { uuid, now } from "./http";

/**
 * Record an admin/impersonation-relevant action. When the actor is operating
 * under an impersonation session, BOTH the impersonated user (actor_user_id) and
 * the real admin (impersonator_id) are recorded — non-negotiable accountability.
 */
export async function audit(
  env: Env,
  auth: AuthContext | null,
  action: string,
  opts: { entityType?: string; entityId?: string; meta?: unknown } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, impersonator_id, action, entity_type, entity_id, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      uuid(),
      auth?.user.id ?? null,
      auth?.session.impersonator_id ?? null,
      action,
      opts.entityType ?? null,
      opts.entityId ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null,
      now(),
    )
    .run();
}
