// Sends transactional emails. The transport is chosen by configuration (EMAIL_PROVIDER): SMTP for any relay
// (Azure Communication Services, SendGrid, Microsoft 365, Gmail) or a development log transport. Business code
// never talks to a transport directly: applicant emails go through notifications/applicant-notification.service.
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: Number(env.SMTP_PORT) === 465,
      requireTLS: Number(env.SMTP_PORT) !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export const isEmailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

/** The transport in use: 'smtp' or 'log'. */
export const emailProvider = () => env.EMAIL_PROVIDER || (isEmailConfigured() ? 'smtp' : 'log');

/** True for addresses at reserved/test domains (EMAIL_SUPPRESS_DOMAINS), which are never emailed. */
export function isSuppressedAddress(address) {
  const domain = String(address || '').split('@')[1]?.toLowerCase().trim();
  if (!domain) return true;
  return env.EMAIL_SUPPRESS_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    .some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Delivers one email and throws when it cannot (the caller decides whether to retry).
 * @returns {Promise<{ provider: 'smtp'|'log', messageId: string|null }>}
 */
export async function deliverEmail({ to, subject, html, text }) {
  const provider = emailProvider();
  if (provider === 'smtp') {
    const t = getTransporter();
    if (!t) throw new Error('SMTP is selected but SMTP_HOST, SMTP_USER and SMTP_PASS are not all set');
    const info = await t.sendMail({ from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`, to, subject, html, text });
    console.log(`[Email] Sent "${subject}" to ${to} (${info.messageId})`);
    return { provider, messageId: info.messageId || null };
  }
  // Development transport: nothing leaves the server
  console.log(`[Email:log] To: ${to} | Subject: ${subject}\n${text}\n[Email:log] ----`);
  if (env.EMAIL_OUTBOX_DIR) {
    fs.mkdirSync(env.EMAIL_OUTBOX_DIR, { recursive: true });
    const file = path.join(env.EMAIL_OUTBOX_DIR, `${Date.now()}-${String(to).replace(/[^a-z0-9.@_-]/gi, '_')}.html`);
    fs.writeFileSync(file, `<!-- To: ${to} | Subject: ${subject} -->\n${html}`);
  }
  return { provider, messageId: null };
}

/** Fire-and-forget send for the email intake: never throws, returns null when nothing was sent. */
export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP not configured — skipping email to', to);
    return null;
  }
  try {
    return await deliverEmail({ to, subject, html, text });
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return null;
  }
}

// Every student email, including the replies to emailed transcripts, is rendered in notifications/applicant-templates.js.

export default { isEmailConfigured, emailProvider, isSuppressedAddress, deliverEmail, sendEmail };
