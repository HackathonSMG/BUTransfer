// Sends transactional emails via Gmail SMTP using nodemailer.
// All student-facing emails go through here so templates stay in one place.
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: false,
      requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export const isEmailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.warn('[Email] SMTP not configured — skipping email to', to);
    return null;
  }
  try {
    const info = await t.sendMail({ from: `"BU Transfer Office" <${env.EMAIL_FROM}>`, to, subject, html, text });
    console.log(`[Email] Sent "${subject}" to ${to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return null;
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function sendApplicationConfirmation(toEmail, studentName, referenceNumber, secureToken = null) {
  const name = studentName || 'Applicant';
  const trackingLink = secureToken ? `${env.APP_URL}/status/${secureToken}` : null;
  const trackingText = trackingLink
    ? `\nTrack your application at any time using this private link:\n${trackingLink}\n`
    : '';
  const trackingHtml = trackingLink
    ? `<div style="background:#eef4ff;border:1px solid #c7d7f5;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#1a3a6b">Your Application Tracking Link</p>
    <a href="${trackingLink}" style="color:#cc0000;word-break:break-all;font-size:13px">${trackingLink}</a>
    <p style="margin:8px 0 0;font-size:12px;color:#555">Bookmark this link — it lets you check your status, upload documents, and view your evaluation result. No login required.</p>
  </div>`
    : '';
  return sendEmail({
    to: toEmail,
    subject: `Application Received — ${referenceNumber} | BU Transfer Office`,
    text: [
      `Dear ${name},`,
      '',
      `Thank you for submitting your transfer application to Boston University.`,
      '',
      `Your application reference number is: ${referenceNumber}`,
      trackingText,
      `We have received your application and our team will review it shortly. If your transcript was attached, it has been queued for automated evaluation.`,
      '',
      `You will receive further updates at this email address. If you have questions, reply to this email quoting your reference number.`,
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
  <p>Thank you for submitting your transfer application. We have received it and it is now in our review queue.</p>
  <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <p style="margin:0;font-size:13px;color:#555">Your Reference Number</p>
    <p style="margin:8px 0 0;font-size:26px;font-weight:bold;letter-spacing:2px;color:#cc0000">${referenceNumber}</p>
  </div>
  ${trackingHtml}
  <p>If you attached a transcript, it has been queued for automated evaluation. Our team will review the results and reach out if anything further is needed.</p>
  <p>Please keep your reference number for future correspondence. You can reply to this email quoting it at any time.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#888">Boston University Transfer Office &nbsp;|&nbsp; 233 Bay State Road, Boston, MA 02215</p>
</body>
</html>`,
  });
}

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

export async function sendDecisionEmail(toEmail, studentName, referenceNumber, decision, comments) {
  const name = studentName || 'Applicant';
  const approved = decision === 'approved';
  return sendEmail({
    to: toEmail,
    subject: `Transfer Application ${approved ? 'Approved' : 'Decision'} — ${referenceNumber} | BU Transfer Office`,
    text: [
      `Dear ${name},`,
      '',
      `A decision has been made on your transfer application (${referenceNumber}).`,
      '',
      `Decision: ${approved ? 'APPROVED' : 'NOT APPROVED'}`,
      comments ? `\nComments: ${comments}` : '',
      '',
      'If you have questions, please contact the Transfer Office.',
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
  <p>A decision has been made on your transfer application <strong>${referenceNumber}</strong>.</p>
  <div style="background:${approved ? '#f0fff0' : '#fff0f0'};border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <p style="margin:0;font-size:20px;font-weight:bold;color:${approved ? '#2d7a2d' : '#cc0000'}">${approved ? '✓ Approved' : '✗ Not Approved'}</p>
  </div>
  ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
  <p>If you have questions, please reply to this email quoting your reference number.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#888">Boston University Transfer Office &nbsp;|&nbsp; 233 Bay State Road, Boston, MA 02215</p>
</body>
</html>`,
  });
}

export default { isEmailConfigured, sendEmail, sendApplicationConfirmation, sendInfoRequiredEmail, sendDecisionEmail };
