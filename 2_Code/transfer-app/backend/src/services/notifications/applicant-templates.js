// Applicant email and in-app notification wording, one template per applicant-visible event. Templates only
// format; which events exist and when they fire is decided in applicant-notification.service.js.
import { env } from '../../config/env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const trackUrl = (referenceNumber) =>
  `${env.APP_URL.replace(/\/$/, '')}/track${referenceNumber ? `?id=${encodeURIComponent(referenceNumber)}` : ''}`;

/**
 * @typedef {{ name?: string, reference_number: string, status_label: string, detail?: object }} TemplateContext
 * Each template returns { subject, heading, intro, body: string[], action?: string, title, message }.
 * title/message are the in-app notification shown on the tracking page.
 */
const TEMPLATES = {
  application_received: (c) => ({
    subject: `Transfer Credit Evaluation Received — ${c.reference_number}`,
    heading: 'Your transcripts have been received',
    intro: 'Your transcripts have been received for transfer credit evaluation and are now being processed.',
    body: [
      'We will read your transcript and check each course against Boston University\'s transfer equivalency records. Courses that need a closer look are reviewed by the academic department.',
      'We will email you when your evaluation reaches an important stage or if we need anything from you.',
    ],
    details: (c.detail?.transcripts || []).map((t) => [t.institution, `${plural(t.courses, 'course')} read from the transcript`]),
    detailsTitle: 'Transcripts received',
    next: [
      'Each course is checked against Boston University\'s transfer equivalency records.',
      'Courses that need a closer look are reviewed by the academic department.',
      'The Credit Evaluation Office completes a final review and posts your transfer credit with a grade of T.',
    ],
    title: 'Transcripts received',
    message: 'Your transcripts have been received for transfer credit evaluation and are now being processed.',
  }),

  information_required: (c) => {
    const items = c.detail?.items || [];
    return {
      subject: `Additional Information Required — ${c.reference_number}`,
      heading: 'Additional information required',
      intro: 'Additional information is required to continue evaluating your transfer credit application.',
      body: [
        items.length ? `We need: ${items.join('; ')}.` : 'Please check your transfer credit status for details.',
        'Until the information is reviewed, the course shows 0 BU units.',
      ],
      action: 'Open your transfer credit status, find the course marked "Action needed", and upload the requested document or reply.',
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
      next: [
        'Department evaluators review each course; if a syllabus is needed, we will email you.',
        'Once every course has a decision, the Credit Evaluation Office completes a final review.',
      ],
      title: 'Course evaluation update',
      message: n ? `${plural(n, 'course')} ${n === 1 ? 'is' : 'are'} with academic department evaluators.` : 'Your courses are with academic department evaluators.',
    };
  },

  final_review: () => ({
    subject: `Your Transfer Credit Is in Final Review — ${'{ref}'}`,
    heading: 'Final review by the Credit Evaluation Office',
    intro: 'Every course in your transfer credit evaluation now has a decision.',
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
      'Use Track Transfer Credit to see the result for each course.',
    ],
    title: 'Decision available',
    message: 'Your transfer credit evaluation is complete. View the course-by-course results.',
  }),

  application_closed: () => ({
    subject: `Transfer Credit Evaluation Closed — ${'{ref}'}`,
    heading: 'Evaluation closed',
    intro: 'Your transfer credit evaluation has been closed by the Credit Evaluation Office.',
    body: ['If you submitted transcripts more than once, your coursework continues to be evaluated under your other Transfer Credit ID. If you think this is a mistake, contact the transfer credit team quoting your Transfer Credit ID.'],
    title: 'Evaluation closed',
    message: 'This transfer credit evaluation has been closed by the Credit Evaluation Office.',
  }),

  // Sent on request from the "existing application" check; lists every application for the address
  application_lookup: (c) => ({
    subject: 'Your Transfer Credit IDs',
    heading: 'Your Transfer Credit IDs',
    intro: 'You asked us to send the Transfer Credit IDs associated with this email address.',
    body: (c.detail?.applications || []).map((a) => `${a.reference_number}: ${a.status_label} (submitted ${a.submitted})`),
    title: 'Transfer Credit IDs sent',
    message: 'Transfer Credit IDs were sent to this email address.',
  }),
};

export const TEMPLATE_EVENTS = Object.keys(TEMPLATES);

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/**
 * The shared layout of every student email: email-safe (nested tables, inline styles, web-safe fonts, no images or
 * external resources), a 600px card that narrows on phones, a bulletproof button with a VML fallback for Outlook.
 * @param {{ subject, preheader, heading, greeting, intro, id?: {reference_number, status_label}, details?: Array<[string,string]>,
 *   detailsTitle?, body?: string[], action?, next?: string[], button: {label, href}, note?: string[] }} m
 */
export function renderLayout(m) {
  const tone = /complete|decision available/i.test(m.id?.status_label || '') ? ['#ecfdf5', '#065f46', '#a7f3d0']
    : /action required/i.test(m.id?.status_label || '') ? ['#fffbeb', '#92400e', '#fcd34d'] : ['#eff6ff', '#1e40af', '#bfdbfe'];
  const p = (text, extra = '') => `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#1f2937${extra}">${esc(text)}</p>`;
  const section = (title) => `<div style="margin:0 0 10px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6b7280">${esc(title)}</div>`;
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>${esc(m.subject)}</title>
<!--[if mso]><style>table,td,p,a,h1,div{font-family:Arial,sans-serif !important}</style><![endif]-->
<style>
  @media only screen and (max-width:620px){ .card{width:100% !important} .px{padding-left:22px !important;padding-right:22px !important} .appno{font-size:24px !important} .h1{font-size:23px !important} }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f1ee;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f1ee">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ee">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e7e2dc;border-radius:10px;overflow:hidden">
    <!-- Header: university wordmark on BU red, with a darker rule -->
    <tr><td class="px" style="background:#cc0000;padding:26px 36px 22px;border-bottom:4px solid #990000">
      <div style="font-family:${SERIF};font-size:26px;line-height:1.1;color:#ffffff;letter-spacing:.3px">Boston University</div>
      <div style="margin-top:6px;font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#ffd9d9">Credit Evaluation Office &nbsp;·&nbsp; Transfer Credit</div>
    </td></tr>
    <!-- Heading and greeting -->
    <tr><td class="px" style="padding:34px 36px 6px;font-family:${FONT}">
      <h1 class="h1" style="margin:0 0 20px;font-family:${SERIF};font-size:27px;line-height:1.25;font-weight:normal;color:#111827">${esc(m.heading)}</h1>
      ${p(m.greeting)}
      ${p(m.intro, ';margin-bottom:24px')}
    </td></tr>
    ${m.id ? `<!-- Transfer Credit ID and status -->
    <tr><td class="px" style="padding:0 36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f6;border:1px solid #ece6df;border-left:4px solid #cc0000;border-radius:8px">
        <tr>
          <td style="padding:16px 18px;font-family:${FONT}">
            <div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280">Transfer Credit ID</div>
            <div class="appno" style="margin-top:4px;font-family:Consolas,'Courier New',monospace;font-size:26px;font-weight:bold;letter-spacing:1.5px;color:#111827">${esc(m.id.reference_number)}</div>
          </td>
          ${m.id.status_label ? `<td align="right" style="padding:16px 18px;font-family:${FONT};vertical-align:middle">
            <div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Status</div>
            <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${tone[0]};border:1px solid ${tone[2]};color:${tone[1]};font-size:13px;font-weight:bold;white-space:nowrap">${esc(m.id.status_label)}</span>
          </td>` : ''}
        </tr>
      </table>
    </td></tr>` : ''}
    ${m.details?.length ? `<!-- Details -->
    <tr><td class="px" style="padding:26px 36px 0;font-family:${FONT}">
      ${section(m.detailsTitle || 'Details')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ece6df">
        ${m.details.map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #ece6df;font-size:14px;color:#111827;font-weight:bold">${esc(k)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #ece6df;font-size:14px;color:#4b5563">${esc(v)}</td></tr>`).join('')}
      </table>
    </td></tr>` : ''}
    ${(m.body?.length || m.action) ? `<tr><td class="px" style="padding:${m.id || m.details?.length ? 24 : 0}px 36px 0;font-family:${FONT}">
      ${(m.body || []).map((b) => p(b)).join('')}
      ${m.action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px"><tr>
        <td style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.55;color:#78350f">
          <strong style="display:block;margin-bottom:2px;color:#92400e">What you need to do</strong>${esc(m.action)}
        </td></tr></table>` : ''}
    </td></tr>` : ''}
    ${m.next?.length ? `<!-- What happens next -->
    <tr><td class="px" style="padding:22px 36px 0;font-family:${FONT}">
      ${section('What happens next')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${m.next.map((step, i) => `<tr>
          <td width="34" valign="top" style="padding:0 0 12px"><div style="width:24px;height:24px;line-height:24px;border-radius:999px;background:#fdecec;color:#cc0000;font-size:12px;font-weight:bold;text-align:center">${i + 1}</div></td>
          <td valign="top" style="padding:2px 0 12px;font-size:14px;line-height:1.55;color:#374151">${esc(step)}</td>
        </tr>`).join('')}
      </table>
    </td></tr>` : ''}
    <!-- Call to action -->
    <tr><td class="px" align="left" style="padding:22px 36px 8px">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(m.button.href)}" style="height:46px;v-text-anchor:middle;width:260px" arcsize="14%" stroke="f" fillcolor="#cc0000"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${esc(m.button.label)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-- --><a href="${esc(m.button.href)}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;font-family:${FONT};font-weight:bold;font-size:15px;line-height:46px;padding:0 30px;border-radius:6px">${esc(m.button.label)}</a><!--<![endif]-->
    </td></tr>
    <tr><td class="px" style="padding:6px 36px 30px;font-family:${FONT}">
      ${(m.note || []).map((n) => `<p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#6b7280">${esc(n)}</p>`).join('')}
    </td></tr>
    <!-- Footer -->
    <tr><td class="px" style="border-top:1px solid #ece6df;background:#faf8f6;padding:20px 36px;font-family:${FONT};font-size:12px;line-height:1.65;color:#8a8178">
      <div style="font-family:${SERIF};font-size:15px;color:#4b443d;margin-bottom:4px">Boston University</div>
      Credit Evaluation Office &nbsp;·&nbsp; Transfer Credit Evaluation<br>
      ${esc(m.footer || 'You are receiving this email because transcripts were submitted for transfer credit evaluation with this address.')}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

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
    ...(showStatus ? [`Transfer Credit ID: ${ctx.reference_number}`, `Current status: ${ctx.status_label}`, ''] : []),
    ...(t.details?.length ? [`${t.detailsTitle || 'Details'}:`, ...t.details.map(([k, v]) => `  ${k}: ${v}`), ''] : []),
    ...t.body.flatMap((b) => [b, '']),
    ...(t.action ? [`What you need to do: ${t.action}`, ''] : []),
    ...(t.next?.length ? ['What happens next:', ...t.next.map((s, i) => `  ${i + 1}. ${s}`), ''] : []),
    `Track your transfer credit: ${link}`,
    'You will need your Transfer Credit ID and this email address.', '',
    'Boston University · Credit Evaluation Office',
    'You are receiving this email because transcripts were submitted for transfer credit evaluation with this address.',
  ].join('\n');

  const html = renderLayout({
    subject,
    preheader: `${t.intro} Transfer Credit ID ${ctx.reference_number}.`,
    heading: t.heading,
    greeting,
    intro: t.intro,
    id: showStatus ? { reference_number: ctx.reference_number, status_label: ctx.status_label } : null,
    details: t.details,
    detailsTitle: t.detailsTitle,
    body: t.body,
    action: t.action,
    next: t.next,
    button: { label: 'Track Your Transfer Credit', href: link },
    note: ['You will need your Transfer Credit ID and this email address.', 'If you have questions, the tracking page shows the details of each course.'],
  });

  return { subject, text, html, title: t.title, message: t.message };
}

/**
 * Replies to an emailed submission that could not be accepted (there is no Transfer Credit ID yet).
 * kind: 'no_transcript' (no attachment could be read as a transcript).
 */
export function renderIntakeReply(kind, { name = null, files = [] } = {}) {
  if (kind !== 'no_transcript') throw new Error(`No intake reply for "${kind}"`);
  const subject = 'We could not find a transcript in your email';
  const greeting = `Dear ${name || 'Student'},`;
  const intro = 'Thank you for your email. We could not find an official transcript among its attachments, so a transfer credit evaluation has not been started.';
  const body = files.length
    ? [`We received: ${files.join(', ')}. None of these could be read as an academic transcript.`]
    : ['The email had no attachments.'];
  const action = 'Reply with your official transcript attached as a PDF (a scan or a photo in JPG or PNG is also accepted), one file per college, or submit it online.';
  const link = `${env.APP_URL.replace(/\/$/, '')}/apply`;
  const text = [greeting, '', intro, '', ...body.flatMap((b) => [b, '']), `What you need to do: ${action}`, '', `Submit online: ${link}`, '',
    'Boston University · Credit Evaluation Office'].join('\n');
  const html = renderLayout({ subject, preheader: intro, heading: 'Your official transcript is needed', greeting, intro, body, action,
    button: { label: 'Submit Transcripts Online', href: link },
    note: ['Only the attached transcript is used for the evaluation; the text of your email is not read.'],
    footer: 'You are receiving this email because you wrote to the Credit Evaluation Office from this address.' });
  return { subject, text, html };
}

export default { renderApplicantEmail, renderIntakeReply, renderLayout, trackUrl, TEMPLATE_EVENTS };
