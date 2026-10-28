// Delivers the emails queued on notification rows (email_status pending/retry). A notification is claimed
// atomically before sending, so two app instances never send the same email. A failed send is retried with
// backoff (2, 4, 8, 16 minutes) up to MAX_ATTEMPTS; a crash mid-send is picked up again after 10 minutes.
// Delivery never throws to its caller: an email failure must not affect the application workflow.
import { query } from '../../config/db.js';
import { deliverEmail } from '../email.service.js';

export const MAX_ATTEMPTS = 5;
const WORKER_INTERVAL_MS = 60 * 1000;

async function claim(notificationId, dueOnly) {
  const { rows: [n] } = await query(
    `UPDATE notifications SET email_status = 'sending', email_attempts = email_attempts + 1, email_next_attempt_at = NOW() + INTERVAL '10 minutes'
     WHERE id = $1 AND recipient_email IS NOT NULL
       AND ((NOT $2 AND email_status = 'pending')
            OR (email_status IN ('pending', 'retry', 'sending') AND email_next_attempt_at <= NOW()))
     RETURNING id, recipient_email, data, email_attempts`,
    [notificationId, dueOnly]);
  return n || null;
}

/** Sends one queued notification email now. Returns the resulting email_status, or null if it was not claimable. */
export async function deliver(notificationId, { dueOnly = false } = {}) {
  let n;
  try {
    n = await claim(notificationId, dueOnly);
    if (!n) return null;
    const email = n.data?.email;
    if (!email?.subject) throw new Error('Notification has no rendered email');
    const { provider } = await deliverEmail({ to: n.recipient_email, subject: email.subject, html: email.html, text: email.text });
    const status = provider === 'smtp' ? 'sent' : 'logged';
    await query(`UPDATE notifications SET email_status = $1, emailed_at = NOW(), email_error = NULL, email_next_attempt_at = NULL WHERE id = $2`, [status, n.id]);
    return status;
  } catch (err) {
    console.error(`[Email outbox] Notification ${notificationId} not delivered (attempt ${n?.email_attempts ?? '?'}):`, err.message);
    if (!n) return null;
    const final = n.email_attempts >= MAX_ATTEMPTS;
    await query(
      `UPDATE notifications SET email_status = $1, email_error = $2,
         email_next_attempt_at = CASE WHEN $1 = 'retry' THEN NOW() + make_interval(mins => $3) ELSE NULL END
       WHERE id = $4`,
      [final ? 'failed' : 'retry', String(err.message).slice(0, 500), 2 ** n.email_attempts, n.id]).catch(() => {});
    return final ? 'failed' : 'retry';
  }
}

/** Delivers every due email (retries, and pending ones whose immediate send never ran). */
export async function processOutbox(limit = 25) {
  const { rows } = await query(
    `SELECT id FROM notifications WHERE email_status IN ('pending', 'retry', 'sending') AND email_next_attempt_at <= NOW()
     ORDER BY email_next_attempt_at LIMIT $1`, [limit]);
  const results = [];
  for (const r of rows) results.push(await deliver(r.id, { dueOnly: true }));
  return results;
}

let timer = null;
export function startEmailOutboxWorker() {
  if (timer) return;
  const tick = () => processOutbox().catch((err) => console.error('[Email outbox] Worker error:', err.message));
  timer = setInterval(tick, WORKER_INTERVAL_MS);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  console.log('[Email outbox] Worker started (every 60 s)');
}

export default { deliver, processOutbox, startEmailOutboxWorker, MAX_ATTEMPTS };
