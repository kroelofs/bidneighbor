import type { Env, NotificationJob } from "./types";
import { sendEmail, layout } from "./lib/email";
import { uuid, now } from "./lib/http";
import { recipientOf } from "./lib/conversations";
import { moderateContent } from "./lib/ai";

/**
 * Notification consumer. This is where ALL email is sent — never inside
 * ctx.waitUntil (30s cap + silent cancellation). Queues give at-least-once
 * delivery with retries; throwing on a batch message re-delivers it.
 */
export async function handleQueue(batch: MessageBatch<NotificationJob>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await handleJob(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error("notification job failed", msg.body, err);
      msg.retry();
    }
  }
}

async function handleJob(job: NotificationJob, env: Env): Promise<void> {
  switch (job.type) {
    case "magic_link": {
      const html = layout(
        "Sign in to BidNeighbor",
        `<p>Click the button below to sign in. This link expires in 15 minutes.</p>
         <p><a href="${job.link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in</a></p>
         <p style="font-size:12px;color:#888">If you didn't request this, you can ignore it.</p>`,
      );
      await recordAndSend(env, null, "magic_link", job.email, "Your BidNeighbor sign-in link", html);
      return;
    }
    case "task_posted": {
      const task = await env.DB.prepare(
        "SELECT t.id, t.title, t.county, t.category_id, c.name AS category_name FROM tasks t JOIN categories c ON c.id = t.category_id WHERE t.id = ?",
      ).bind(job.task_id).first<{ id: string; title: string; county: string | null; category_id: string; category_name: string }>();
      if (!task) return;
      // Matching rule: same county + subscribed to the category + active provider
      // who hasn't turned off new-task emails.
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT u.id, u.email FROM users u
         JOIN user_categories uc ON uc.user_id = u.id AND uc.category_id = ?
         WHERE u.status = 'active' AND u.notify_new_tasks = 1 AND (u.county = ? OR ? IS NULL)`,
      ).bind(task.category_id, task.county, task.county).all<{ id: string; email: string }>();
      const recipients = results ?? [];
      // Record how many providers we reached so the poster gets a real "we notified
      // N providers nearby" instead of staring at zero bids. Written once, by PK.
      await env.DB.prepare("UPDATE tasks SET notified_provider_count = ? WHERE id = ?")
        .bind(recipients.length, task.id).run();
      for (const provider of recipients) {
        await recordAndSend(env, provider.id, "task_posted", provider.email, "New local job posted",
          layout("New job near you", `<p>A new <b>${task.category_name}</b> job was posted in ${task.county ?? "your area"}: <b>${task.title}</b>.</p>
           <p><a href="${env.APP_BASE_URL}/tasks/${task.id}">View the job</a></p>`));
      }
      return;
    }
    case "response_received": {
      const row = await env.DB.prepare(
        `SELECT t.title, t.id AS task_id, cust.email AS customer_email, cust.notify_responses
         FROM responses r JOIN tasks t ON t.id = r.task_id JOIN users cust ON cust.id = t.customer_id
         WHERE r.id = ?`,
      ).bind(job.response_id).first<{ title: string; task_id: string; customer_email: string; notify_responses: number }>();
      if (!row || row.notify_responses !== 1) return;
      await recordAndSend(env, null, "response_received", row.customer_email, "You got a response",
        layout("Someone responded to your job", `<p>You have a new response on <b>${row.title}</b>.</p>
         <p><a href="${env.APP_BASE_URL}/tasks/${row.task_id}">View responses</a></p>`));
      return;
    }
    case "response_selected": {
      const row = await env.DB.prepare(
        `SELECT t.title, t.id AS task_id, prov.email AS provider_email, prov.notify_responses
         FROM responses r JOIN tasks t ON t.id = r.task_id JOIN users prov ON prov.id = r.provider_id
         WHERE r.id = ?`,
      ).bind(job.response_id).first<{ title: string; task_id: string; provider_email: string; notify_responses: number }>();
      if (!row || row.notify_responses !== 1) return;
      await recordAndSend(env, null, "response_selected", row.provider_email, "You were selected!",
        layout("You were selected for a job", `<p>You were selected for <b>${row.title}</b>. Nice work!</p>
         <p><a href="${env.APP_BASE_URL}/tasks/${row.task_id}">View the job</a></p>`));
      return;
    }
    case "message_received": {
      const row = await env.DB.prepare(
        `SELECT m.sender_id, c.id AS conversation_id, c.owner_id, c.initiator_id
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = ?`,
      ).bind(job.message_id).first<{ sender_id: string; conversation_id: string; owner_id: string; initiator_id: string }>();
      if (!row) return;
      const recipientId = recipientOf(row, row.sender_id);
      const recipient = await env.DB.prepare(
        "SELECT email, notify_messages FROM users WHERE id = ?",
      ).bind(recipientId).first<{ email: string; notify_messages: number }>();
      if (!recipient || recipient.notify_messages !== 1) return;
      // Never put the message text in the email — a thread can hold anything. Link out.
      const link = `${env.APP_BASE_URL}/messages/${row.conversation_id}`;
      await recordAndSend(env, recipientId, "message_received", recipient.email, "You have a new message",
        layout("New message on BidNeighbor", `<p>You have a new private message about a job.</p>
         <p><a href="${link}">Read and reply</a></p>`));
      return;
    }
    case "moderate_resource": {
      const r = await env.DB.prepare("SELECT id, title, description, moderation_state FROM resources WHERE id = ?")
        .bind(job.resource_id).first<{ id: string; title: string; description: string; moderation_state: string }>();
      if (!r || r.moderation_state !== "pending") return; // edited/re-queued or gone
      const verdict = await moderateContent(env, `${r.title}\n\n${r.description}`);
      if (verdict.risky) {
        // Hide from the board and route to the admin queue with the AI's reason.
        await env.DB.prepare("UPDATE resources SET status = 'flagged', moderation_state = 'flagged', updated_at = ? WHERE id = ?")
          .bind(now(), r.id).run();
        await env.DB.prepare(
          "INSERT INTO admin_flags (id, entity_type, entity_id, reason, status, created_at) VALUES (?, 'resource', ?, ?, 'open', ?)",
        ).bind(uuid(), r.id, `AI moderation: ${verdict.reason ?? "flagged"}${verdict.categories?.length ? ` [${verdict.categories.join(", ")}]` : ""}`, now()).run();
      } else {
        await env.DB.prepare("UPDATE resources SET moderation_state = 'clear', updated_at = ? WHERE id = ?")
          .bind(now(), r.id).run();
      }
      return;
    }
  }
}

async function recordAndSend(
  env: Env,
  userId: string | null,
  type: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO notifications (id, user_id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)",
  ).bind(id, userId, type, JSON.stringify({ to, subject }), now()).run();
  const res = await sendEmail(env, to, subject, html);
  await env.DB.prepare("UPDATE notifications SET status = ?, sent_at = ? WHERE id = ?")
    .bind(res.ok ? "sent" : "failed", now(), id).run();
  if (!res.ok) throw new Error(`email send failed: ${res.detail ?? "unknown"}`);
}
