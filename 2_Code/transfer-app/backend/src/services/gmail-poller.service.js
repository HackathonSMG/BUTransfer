// Polls Gmail IMAP for unread emails and hands each one to the email intake (services/intake/email-intake.service.js),
// which uses only the attachments: the transcript is the source of truth and the email body is never read.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../config/env.js';
import { ingestEmail } from './intake/email-intake.service.js';

const POLL_INTERVAL_MS = 60_000;

// ── Process a single email ─────────────────────────────────────────────────

async function processEmail(rawSource) {
  const parsed = await simpleParser(rawSource);
  const from = parsed.from?.value?.[0];
  if (!from?.address) {
    console.warn('[EmailIntake] Could not read the sender address; skipping');
    return;
  }
  console.log(`[EmailIntake] Email from ${from.address} with ${parsed.attachments?.length || 0} attachment(s)`);
  await ingestEmail({
    fromAddress: from.address,
    fromName: from.name?.trim() || null,
    subject: parsed.subject || '',
    attachments: (parsed.attachments || []).map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
  });
}

// ── IMAP poller ────────────────────────────────────────────────────────────

async function pollOnce() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let processed = 0;

  try {
    // Fetch all unseen messages
    const uids = [];
    for await (const msg of client.fetch({ seen: false }, { uid: true })) {
      uids.push(msg.uid);
    }

    for (const uid of uids) {
      try {
        // Fetch full source for this message
        let rawSource = null;
        for await (const msg of client.fetch(uid, { source: true }, { uid: true })) {
          rawSource = msg.source;
        }
        if (!rawSource) continue;

        await processEmail(rawSource);
        // Mark as read
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        processed++;
      } catch (err) {
        console.error(`[EmailIntake] Error processing UID ${uid}:`, err.message);
        // Mark as read anyway to avoid re-processing a broken email in a loop
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }).catch(() => {});
      }
    }

    if (processed > 0) console.log(`[EmailIntake] Processed ${processed} email(s)`);
  } finally {
    lock.release();
    await client.logout();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

let running = false;

export function startEmailPoller() {
  if (running) return;
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.log('[EmailIntake] Gmail credentials not set — poller disabled');
    return;
  }
  running = true;
  console.log(`[EmailIntake] Gmail poller started — ${env.SMTP_USER} — checking every ${POLL_INTERVAL_MS / 1000}s`);

  const tick = async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error('[EmailIntake] Poll cycle error:', err.message);
      if (err.response) console.error('[EmailIntake] IMAP server response:', err.response);
      if (err.code) console.error('[EmailIntake] Error code:', err.code);
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  // First poll after 5 seconds to let the server fully start
  setTimeout(tick, 5000);
}

export default { startEmailPoller };
