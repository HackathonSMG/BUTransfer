// Applicant email and in-app notification wording, one template per applicant-visible event. Templates only
// format; which events exist and when they fire is decided in applicant-notification.service.js.
import { env } from '../../config/env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const trackUrl = (referenceNumber) =>
  `${env.APP_URL.replace(/\/$/, '')}/track${referenceNumber ? `?application=${encodeURIComponent(referenceNumber)}` : ''}`;

/**
 * @typedef {{ name?: string, reference_number: string, status_label: string, detail?: object }} TemplateContext
 * Each template returns { subject, heading, intro, body: string[], action?: string, title, message }.
 * title/message are the in-app notification shown on the tracking page.
 */
const TEMPLATES = {
  application_received: (c) => ({
    subject: `Transfer Credit Application Received — ${c.reference_number}`,
    heading: 'Your application has been received',
    intro: 'Your transfer credit application has been received and is now being processed.',
    body: [
      'We will read your transcript and check each course against Boston University\'s transfer equivalency records. Courses that need a closer look are reviewed by the academic department.',
      'We will email you when your application reaches an important stage or if we need anything from you.',
    ],
    title: 'Application received',
    message: 'Your transfer credit application has been received and is now being processed.',
  }),

  information_required: (c) => {
    const items = c.detail?.items || [];
    return {
      subject: `Additional Information Required — ${c.reference_number}`,
      heading: 'Additional information required',
      intro: 'Additional information is required to continue evaluating your transfer credit application.',
      body: [
        items.length ? `We need: ${items.join('; ')}.` : 'Please review your application for details.',
        'Until the information is reviewed, the course shows 0 BU units.',
      ],
      action: 'Open your application, find the course marked "Action needed", and upload the requested document or reply.',
      title: 'Additional information required',
      message: items.length ? `We need: ${items.join('; ')}.` : 'Additional information is required to continue evaluating your application.',
    };
  },

  department_review: (c) => {
    const n = c.detail?.courses_in_review;
    return {
      subject: `Course Evaluation Update — ${c.reference_number}`,
      heading: 'Your courses are with the academic departments',
      intro: 'Your transcript has been processed and your courses have been checked against Boston University\'s transfer equivalency records.',
      body: [
        n ? `${plural(n, 'course')} ${n === 1 ? 'is' : 'are'} now being reviewed by academic department evaluators.` : 'Some courses are now being reviewed by academic department evaluators.',
        'Courses with an established equivalency have already been evaluated. Courses still under review show 0 BU units until they are decided.',
      ],
      title: 'Course evaluation update',
      message: n ? `${plural(n, 'course')} ${n === 1 ? 'is' : 'are'} with academic department evaluators.` : 'Your courses are with academic department evaluators.',
    };
  },

  final_review: () => ({
    subject: `Your Transfer Credit Is in Final Review — ${'{ref}'}`,
    heading: 'Final review by the Credit Evaluation Office',
    intro: 'Every course on your application now has a decision.',
    body: ['The Credit Evaluation Office is completing the final review before your transfer credit is posted. We will email you when the result is available.'],
    title: 'Final review',
    message: 'Every course has a decision. The Credit Evaluation Office is completing the final review.',
  }),

  credit_posted: (c) => ({
    subject: `Transfer Credit Posted — ${c.reference_number}`,
    heading: 'Transfer credit posted',
    intro: `${plural(c.detail?.courses || 0, 'course')} ${c.detail?.courses === 1 ? 'has' : 'have'} been posted to your record (${c.detail?.units ?? 0} BU credits, grade T).`,
    body: ['Your other courses are still being evaluated. They show 0 BU units until they are decided.'],
    title: 'Transfer credit posted',
    message: `${plural(c.detail?.courses || 0, 'course')} posted (${c.detail?.units ?? 0} BU credits). Other courses are still being evaluated.`,
  }),

  decision_available: (c) => ({
    subject: `Your Transfer Credit Decision Is Available — ${c.reference_number}`,
    heading: 'Your transfer credit evaluation is complete',
    intro: 'The Credit Evaluation Office has finalized your transfer credit evaluation.',
    body: [
      c.detail?.units != null
        ? `${c.detail.units} BU credits have been awarded across ${plural(c.detail.awarded || 0, 'course')}, posted with a grade of T. Transfer grades do not count toward your BU GPA.`
        : 'Your course-by-course results are ready to view.',
      'Use Track Application to see the result for each course.',
    ],
    title: 'Decision available',
    message: 'Your transfer credit evaluation is complete. View the course-by-course results.',
  }),

  application_closed: () => ({
    subject: `Transfer Credit Application Closed — ${'{ref}'}`,
    heading: 'Application closed',
    intro: 'Your transfer credit application has been closed by the Credit Evaluation Office.',
    body: ['If you submitted more than one application, your coursework continues to be evaluated on your other application. If you think this is a mistake, contact the transfer credit team quoting your application number.'],
    title: 'Application closed',
    message: 'This application has been closed by the Credit Evaluation Office.',
  }),

  // Sent on request from the "existing application" check; lists every application for the address
  application_lookup: (c) => ({
    subject: 'Your Transfer Credit Applications',
    heading: 'Your transfer credit applications',
    intro: 'You asked us to send the application numbers associated with this email address.',
    body: (c.detail?.applications || []).map((a) => `${a.reference_number}: ${a.status_label} (submitted ${a.submitted})`),
    title: 'Application numbers sent',
    message: 'Application numbers were sent to this email address.',
  }),
};

export const TEMPLATE_EVENTS = Object.keys(TEMPLATES);

/** Renders an event for one applicant: the email (subject, text, html) and the in-app title/message. */
export function renderApplicantEmail(event, ctx) {
  const t = TEMPLATES[event]?.(ctx);
  if (!t) throw new Error(`No applicant template for "${event}"`);
  const subject = t.subject.replace('{ref}', ctx.reference_number);
  const link = trackUrl(ctx.reference_number);
  const greeting = `Dear ${ctx.name || 'Student'},`;
  const showStatus = event !== 'application_lookup';

  const text = [
    greeting, '',
    t.intro, '',
    ...(showStatus ? [`Application number: ${ctx.reference_number}`, `Current status: ${ctx.status_label}`, ''] : []),
    ...t.body.flatMap((b) => [b, '']),
    ...(t.action ? [`What you need to do: ${t.action}`, ''] : []),
    `Track your application: ${link}`,
    'If you have questions, please refer to your application details on the tracking page.',
    'You will need your application number and this email address.', '',
    'Boston University Transfer Credit Evaluation',
    'You are receiving this email because a transfer credit application was submitted with this address.',
  ].join('\n');

  // Email-safe layout: nested tables, inline styles, web-safe fonts, no images or external resources; a
  // 600px card that narrows on phones, a bulletproof button (with a VML fallback for Outlook)
  const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const statusTone = /complete|decision available/i.test(ctx.status_label) ? ['#ecfdf5', '#065f46', '#a7f3d0']
    : /action required/i.test(ctx.status_label) ? ['#fffbeb', '#92400e', '#fcd34d'] : ['#eff6ff', '#1e40af', '#bfdbfe'];
  const preheader = `${t.intro} Application ${ctx.reference_number}.`;
  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<!--[if mso]><style>table,td,p,a,h1{font-family:Arial,sans-serif !important}</style><![endif]-->
<style>
  @media only screen and (max-width:620px){ .card{width:100% !important} .px{padding-left:22px !important;padding-right:22px !important} .appno{font-size:24px !important} }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
    <!-- Header -->
    <tr><td style="background:#cc0000;border-radius:12px 12px 0 0;padding:22px 32px" class="px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:40px;height:40px;background:#ffffff;border-radius:8px;text-align:center;vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:17px;color:#cc0000">BU</td>
        <td style="padding-left:12px;font-family:${FONT}">
          <div style="font-size:17px;font-weight:bold;color:#ffffff;letter-spacing:.2px">Boston University</div>
          <div style="font-size:13px;color:#fde2e2">Transfer Credit Evaluation</div>
        </td>
      </tr></table>
    </td></tr>
    <!-- Body -->
    <tr><td class="px" style="padding:32px 32px 8px;font-family:${FONT};color:#1f2937">
      <p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#cc0000">Transfer Credit Application Update</p>
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#111827;font-weight:bold">${esc(t.heading)}</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6">${esc(greeting)}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6">${esc(t.intro)}</p>
    </td></tr>
    ${showStatus ? `<!-- Application number and status -->
    <tr><td class="px" style="padding:0 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid #111827;border-bottom:2px solid #111827">
        <tr><td align="center" style="padding:18px 12px 6px;font-family:${FONT}">
          <div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6b7280">Application Number</div>
          <div class="appno" style="margin-top:6px;font-family:Consolas,'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:1.5px;color:#111827">${esc(ctx.reference_number)}</div>
        </td></tr>
        <tr><td align="center" style="padding:6px 12px 18px;font-family:${FONT}">
          <span style="font-size:12px;color:#6b7280">Current status&nbsp;&nbsp;</span>
          <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${statusTone[0]};border:1px solid ${statusTone[2]};color:${statusTone[1]};font-size:13px;font-weight:bold">${esc(ctx.status_label)}</span>
        </td></tr>
      </table>
    </td></tr>` : ''}
    <tr><td class="px" style="padding:22px 32px 0;font-family:${FONT};color:#1f2937">
      ${t.body.map((b) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${esc(b)}</p>`).join('')}
      ${t.action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px"><tr>
        <td style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.55;color:#78350f">
          <strong style="display:block;margin-bottom:2px;color:#92400e">What you need to do</strong>${esc(t.action)}
        </td></tr></table>` : ''}
    </td></tr>
    <!-- Call to action -->
    <tr><td class="px" align="left" style="padding:22px 32px 6px">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(link)}" style="height:46px;v-text-anchor:middle;width:240px" arcsize="17%" stroke="f" fillcolor="#cc0000"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">Track Your Application</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-- --><a href="${esc(link)}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;font-family:${FONT};font-weight:bold;font-size:15px;line-height:46px;padding:0 28px;border-radius:8px">Track Your Application</a><!--<![endif]-->
    </td></tr>
    <tr><td class="px" style="padding:6px 32px 28px;font-family:${FONT}">
      <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#6b7280">You will need your application number and this email address.</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">If you have questions, please refer to your application details on the tracking page.</p>
    </td></tr>
    <!-- Footer -->
    <tr><td class="px" style="border-top:1px solid #e5e7eb;background:#f9fafb;border-radius:0 0 12px 12px;padding:18px 32px;font-family:${FONT};font-size:12px;line-height:1.6;color:#9ca3af">
      <strong style="color:#6b7280">Boston University · Transfer Credit Evaluation</strong><br>
      You are receiving this email because a transfer credit application was submitted with this address.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html, title: t.title, message: t.message };
}

export default { renderApplicantEmail, trackUrl, TEMPLATE_EVENTS };
