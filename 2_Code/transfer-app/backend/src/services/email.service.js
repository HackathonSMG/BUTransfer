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

// ── Email intake templates ──────────────────────────────────────────────────
// (The application received / status update emails are in notifications/applicant-templates.js.)

export async function sendInfoRequiredEmail(toEmail, studentName, missingFields, referenceNumber = null) {
  const name = studentName || 'Applicant';
  const ref = referenceNumber ? ` (Ref: ${referenceNumber})` : '';
  const fieldList = missingFields.map((f) => `  • ${f}`).join('\n');
  const fieldListHtml = missingFields.map((f) => `<li>${f}</li>`).join('');

  return sendEmail({
    to: toEmail,
    subject: `Additional Information Required${ref} | BU Transfer Office`,
    text: [
      `Dear ${name},`,
      '',
      `Thank you for contacting the BU Transfer Office${ref}.`,
      '',
      'To process your transfer application, we need the following information:',
      '',
      fieldList,
      '',
      'Please reply to this email with the requested details. If you have a transcript PDF, please attach it.',
      '',
      'Boston University Transfer Office',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="border-left:4px solid #cc0000;padding-left:16px;margin-bottom:24px">
    <h2 style="margin:0;color:#cc0000">Boston University</h2>
    <p style="margin:4px 0 0;color:#555;font-size:14px">Transfer Admissions Office</p>
  </div>
  <p>Dear ${name},</p>
  <p>Thank you for contacting the BU Transfer Office${ref}. To process your application we need a few more details:</p>
  <ul style="line-height:1.8">${fieldListHtml}</ul>
  <p>Please <strong>reply to this email</strong> with the missing information. If you have a transcript, attach it as a PDF.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#888">Boston University Transfer Office &nbsp;|&nbsp; 233 Bay State Road, Boston, MA 02215</p>
</body>
</html>`,
  });
}

export default { isEmailConfigured, emailProvider, isSuppressedAddress, deliverEmail, sendEmail, sendInfoRequiredEmail };
