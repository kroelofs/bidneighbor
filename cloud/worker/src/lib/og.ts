import type { Env } from "../types";
import { taskIdFilter } from "./taskref";

/** Escape a string for safe insertion into an HTML attribute value. */
function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * For a `/tasks/:ref` page, build Open Graph + Twitter meta so shared links show
 * the task title, a snippet, and the first attached image. Returns the shell HTML
 * with the tags injected before </head>, or null when the path isn't a task page
 * or the task can't be found (caller then serves the plain shell).
 */
export async function injectTaskOg(env: Env, pathname: string, html: string): Promise<string | null> {
  const m = /^\/tasks\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const filter = taskIdFilter(decodeURIComponent(m[1]), "id");
  if (!filter) return null;

  const task = await env.DB.prepare(
    `SELECT id, title, description, status FROM tasks WHERE ${filter.clause} ORDER BY id LIMIT 1`,
  ).bind(...filter.binds).first<{ id: string; title: string; description: string; status: string }>();
  if (!task || task.status === "hidden") return null;

  const img = await env.DB.prepare(
    "SELECT id FROM task_files WHERE task_id = ? AND content_type LIKE 'image/%' ORDER BY created_at LIMIT 1",
  ).bind(task.id).first<{ id: string }>();

  const title = attr(task.title);
  const desc = attr(task.description.replace(/\s+/g, " ").slice(0, 200));
  const pageUrl = attr(`${env.APP_BASE_URL}${pathname}`);
  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
  ];
  if (img) {
    const imgUrl = attr(`${env.APP_BASE_URL}/api/files/${img.id}`);
    tags.push(`<meta property="og:image" content="${imgUrl}" />`);
    tags.push(`<meta name="twitter:image" content="${imgUrl}" />`);
  }
  return html.replace("</head>", `${tags.join("")}</head>`);
}
