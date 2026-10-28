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
    heading: 'Application received',
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
    heading: 'Your transfer credit decision is available',
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
  const greeting = `Dear ${ctx.name || 'Applicant'},`;
  const showStatus = event !== 'application_lookup';

  const text = [
    greeting, '',
    t.intro, '',
    ...(showStatus ? [`Application number: ${ctx.reference_number}`, `Current status: ${ctx.status_label}`, ''] : []),
    ...t.body.flatMap((b) => [b, '']),
    ...(t.action ? [`What you need to do: ${t.action}`, ''] : []),
    `Track your application: ${link}`,
    'You will need your application number and this email address.', '',
    'Boston University Transfer Credit Evaluation',
    'You are receiving this email because a transfer credit application was submitted with this address.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:#cc0000;padding:20px 28px;color:#ffffff">
    <div style="font-size:18px;font-weight:bold;letter-spacing:.2px">Boston University</div>
    <div style="font-size:13px;opacity:.9;margin-top:2px">Transfer Credit Evaluation</div>
  </td></tr>
  <tr><td style="padding:28px">
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#111827">${esc(t.heading)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(greeting)}</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55">${esc(t.intro)}</p>
    ${showStatus ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 18px">
      <tr><td style="padding:14px 16px;font-size:13px;color:#6b7280">Application number</td><td style="padding:14px 16px;font-size:16px;font-weight:bold;font-family:Consolas,monospace;color:#111827;text-align:right">${esc(ctx.reference_number)}</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:13px;color:#6b7280">Current status</td><td style="padding:0 16px 14px;font-size:14px;font-weight:bold;color:#cc0000;text-align:right">${esc(ctx.status_label)}</td></tr>
    </table>` : ''}
    ${t.body.map((b) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${esc(b)}</p>`).join('')}
    ${t.action ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;margin:6px 0 16px;font-size:14px;line-height:1.5"><strong>What you need to do:</strong> ${esc(t.action)}</div>` : ''}
    <p style="margin:22px 0 8px"><a href="${esc(link)}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 26px;border-radius:8px">Track Application</a></p>
    <p style="margin:0;font-size:12.5px;color:#6b7280">You will need your application number and this email address.</p>
  </td></tr>
  <tr><td style="border-top:1px solid #e5e7eb;padding:16px 28px;font-size:12px;color:#9ca3af;line-height:1.5">
    Boston University Transfer Credit Evaluation<br/>You are receiving this email because a transfer credit application was submitted with this address.
  </td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject, text, html, title: t.title, message: t.message };
}

export default { renderApplicantEmail, trackUrl, TEMPLATE_EVENTS };
