import type { Env, AuthContext } from "./types";
import { match } from "./lib/match";
import { json, notFound, error } from "./lib/http";
import { isAdmin } from "./lib/guards";
import * as auth from "./routes/auth";
import * as categories from "./routes/categories";
import * as tasks from "./routes/tasks";
import * as responses from "./routes/responses";
import * as conversations from "./routes/conversations";
import * as resources from "./routes/resources";
import * as files from "./routes/files";
import * as provider from "./routes/provider";
import * as places from "./routes/places";
import * as admin from "./routes/admin";
import { getGeo } from "./routes/geo";

type Ctx = { req: Request; env: Env; auth: AuthContext | null; isAdminHost: boolean };

/** Dispatch an /api/* request. Returns a Response, or null if no route matched. */
export async function routeApi(ctx: Ctx): Promise<Response | null> {
  const { req, env } = ctx;
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  let m: Record<string, string> | null;

  // ---- Health ----
  if (path === "/api/_health") {
    return json({ status: "ok", sha: env.GIT_SHA ?? "dev", deployed_at: env.DEPLOYED_AT ?? null });
  }

  // ---- Auth ----
  if (path === "/api/auth/request-link" && method === "POST") return auth.requestLink(req, env);
  if (path === "/api/auth/verify" && method === "GET") return auth.verifyLink(req, env);
  if (path === "/api/auth/google/start" && method === "GET") return auth.googleStart(req, env);
  if (path === "/api/auth/google/callback" && method === "GET") return auth.googleCallback(req, env);
  if (path === "/api/auth/impersonate-land" && method === "GET") return admin.impersonateLand(req, env);
  if (path === "/api/auth/stop-impersonation" && method === "POST") return auth.stopImpersonation(req, env, ctx.auth);
  if (path === "/api/logout" && method === "POST") return auth.logout(req, env, ctx.auth);
  if (path === "/api/me" && method === "GET") return auth.me(req, env, ctx.auth);
  if (path === "/api/me" && method === "PATCH") return provider.updateProfile(req, env, ctx.auth);

  // ---- Address autocomplete (Google Places proxy; sign-in required) ----
  if (path === "/api/places/autocomplete" && method === "POST") return places.autocomplete(req, env, ctx.auth);
  if (path === "/api/places/details" && method === "GET") return places.details(req, env, ctx.auth);

  // ---- Categories ----
  if (path === "/api/categories" && method === "GET") return categories.listCategories(req, env);

  // ---- Public provider directory ----
  if (path === "/api/providers" && method === "GET") return provider.listProviders(req, env);

  // ---- Approximate location (edge geo; client calls only after consent) ----
  if (path === "/api/geo" && method === "GET") return getGeo(req);

  // ---- Tasks ----
  if (path === "/api/tasks" && method === "GET") return tasks.listTasks(req, env);
  if (path === "/api/my-tasks" && method === "GET") return tasks.myTasks(req, env, ctx.auth);
  if (path === "/api/tasks" && method === "POST") return tasks.createTask(req, env, ctx.auth);
  if ((m = match("/api/tasks/:id", path))) {
    if (method === "GET") return tasks.getTask(req, env, ctx.auth, m.id);
    if (method === "PATCH") return tasks.updateTask(req, env, ctx.auth, m.id);
  }
  if ((m = match("/api/tasks/:id/files", path)) && method === "POST") return files.uploadTaskFile(req, env, ctx.auth, m.id);
  if ((m = match("/api/tasks/:id/responses", path))) {
    if (method === "POST") return responses.createResponse(req, env, ctx.auth, m.id);
    if (method === "GET") return tasks.listTaskResponses(req, env, ctx.auth, m.id);
  }
  if ((m = match("/api/tasks/:id/select-response", path)) && method === "POST") return tasks.selectResponse(req, env, ctx.auth, m.id);

  // ---- Files ----
  if ((m = match("/api/files/:id", path)) && method === "GET") return files.serveFile(req, env, m.id);

  // ---- Responses ----
  if ((m = match("/api/responses/:id", path)) && method === "PATCH") return responses.updateResponse(req, env, ctx.auth, m.id);

  // ---- Private conversations (poster <-> one counterpart; participants only) ----
  if (path === "/api/conversations" && method === "GET") return conversations.listConversations(req, env, ctx.auth);
  if (path === "/api/conversations" && method === "POST") return conversations.startConversation(req, env, ctx.auth);
  if ((m = match("/api/conversations/:id/messages", path))) {
    if (method === "GET") return conversations.listMessages(req, env, ctx.auth, m.id);
    if (method === "POST") return conversations.postMessage(req, env, ctx.auth, m.id);
  }
  if ((m = match("/api/conversations/:id/read", path)) && method === "POST") return conversations.markRead(req, env, ctx.auth, m.id);

  // ---- Neighborhood Resources (equipment listings; browse public, mutations session-gated) ----
  if (path === "/api/resources" && method === "GET") return resources.listResources(req, env);
  if (path === "/api/resources" && method === "POST") return resources.createResource(req, env, ctx.auth);
  if ((m = match("/api/resources/:rid/files/:fid", path)) && method === "GET") return resources.serveResourceFile(req, env, m.rid, m.fid);
  if ((m = match("/api/resources/:id/files", path)) && method === "POST") return resources.uploadResourceFile(req, env, ctx.auth, m.id);
  if ((m = match("/api/resources/:id/report", path)) && method === "POST") return resources.reportResource(req, env, ctx.auth, m.id);
  if ((m = match("/api/resources/:id", path))) {
    if (method === "GET") return resources.getResource(req, env, ctx.auth, m.id);
    if (method === "PATCH") return resources.updateResource(req, env, ctx.auth, m.id);
    if (method === "DELETE") return resources.deleteResource(req, env, ctx.auth, m.id);
  }
  if ((m = match("/api/conversations/:id/files", path)) && method === "POST") return conversations.sendImage(req, env, ctx.auth, m.id);
  if ((m = match("/api/conversations/:cid/files/:fid", path)) && method === "GET") return conversations.serveFile(req, env, ctx.auth, m.cid, m.fid);

  // ---- Provider ----
  if (path === "/api/provider/tasks" && method === "GET") return provider.providerTasks(req, env, ctx.auth);
  if (path === "/api/provider/responses" && method === "GET") return provider.providerResponses(req, env, ctx.auth);
  if (path === "/api/provider/categories" && method === "GET") return provider.getProviderCategories(req, env, ctx.auth);
  if (path === "/api/provider/categories" && method === "PUT") return provider.putProviderCategories(req, env, ctx.auth);

  // ---- Admin (admin host ONLY — defense in depth on top of CF Access) ----
  if (path.startsWith("/api/admin/")) {
    if (!ctx.isAdminHost) return notFound(); // admin surface does not exist on the public host
    if (!isAdmin(ctx.auth)) return error(403, "Admin access required");
    if (path === "/api/admin/users" && method === "GET") return admin.adminListUsers(req, env, ctx.auth);
    if ((m = match("/api/admin/users/:id", path)) && method === "PATCH") return admin.adminUpdateUser(req, env, ctx.auth, m.id);
    if ((m = match("/api/admin/users/:id/impersonate", path)) && method === "POST") return admin.adminImpersonate(req, env, ctx.auth, m.id);
    if (path === "/api/admin/tasks" && method === "GET") return admin.adminListTasks(req, env, ctx.auth);
    if ((m = match("/api/admin/tasks/:id", path)) && method === "PATCH") return admin.adminUpdateTask(req, env, ctx.auth, m.id);
    if (path === "/api/admin/categories" && method === "POST") return categories.createCategory(req, env, ctx.auth);
    if ((m = match("/api/admin/categories/:id", path)) && method === "PATCH") return categories.updateCategory(req, env, ctx.auth, m.id);
    if (path === "/api/admin/audit-log" && method === "GET") return admin.adminAuditLog(req, env, ctx.auth);
    if (path === "/api/admin/integrations" && method === "GET") return admin.adminIntegrations(req, env, ctx.auth);
    if (path === "/api/admin/resources" && method === "GET") return resources.adminListResources(req, env, ctx.auth);
    if ((m = match("/api/admin/resources/:id", path)) && method === "PATCH") return resources.adminUpdateResource(req, env, ctx.auth, m.id);
    return notFound();
  }

  return null;
}
