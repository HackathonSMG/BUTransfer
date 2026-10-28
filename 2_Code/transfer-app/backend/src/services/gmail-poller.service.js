// Polls Gmail IMAP for unread emails, extracts student data with AI,
// creates applications, uploads transcript PDFs, and sends confirmation emails.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../config/env.js';
import { createApplication } from './application.service.js';
import { uploadDocument } from './document.service.js';
import { sendInfoRequiredEmail } from './email.service.js';
import { isAgentConfigured, getProjectClient } from './ai/agent.service.js';

const POLL_INTERVAL_MS = 60_000;

// ── AI-based email body parser ─────────────────────────────────────────────

const EXTRACT_PROMPT = `Extract student transfer application data from this email. Return ONLY valid JSON:
{
  "student_name": "Full Name or null",
  "student_phone": "phone number or null",
  "transfer_from_institution": "name of college/university student is coming from, or null",
  "transfer_from_program": "current degree program or null",
  "transfer_to_program": "BU program they want to join, or null",
  "transfer_to_department": "department or school, or null",
  "expected_start_term": "e.g. Fall 2025, or null",
  "gpa": number or null,
  "credits_completed": number or null
}
Use null for any field not clearly stated. Do not invent data.`;

async function extractWithAI(subject, body, openaiClient) {
  try {
    const response = await openaiClient.chat.completions.create({
      model: env.FOUNDRY_MODEL_DEPLOYMENT || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: `Subject: ${subject}\n\n${body.slice(0, 4000)}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error('[EmailIntake] AI extraction failed:', err.message);
    return {};
  }
}

function extractWithRegex(subject, body) {
  const get = (pattern) => { const m = body.match(pattern); return m ? m[1].trim() : null; };
  const subjectName = subject.match(/transfer application[:\s]+(.+)/i)?.[1]?.trim() || null;
  return {
    student_name: get(/(?:name|student name)[:\s]+(.+)/i) || subjectName,
    student_phone: get(/(?:phone|telephone|mobile)[:\s]+(.+)/i),
    transfer_from_institution: get(/(?:transferring from|from institution|current university|current college|university|college)[:\s]+(.+)/i),
    transfer_from_program: get(/(?:current program|current major|from program)[:\s]+(.+)/i),
    transfer_to_program: get(/(?:applying to|target program|intended program|to program|major at bu)[:\s]+(.+)/i),
    transfer_to_department: get(/(?:department|faculty|school)[:\s]+(.+)/i),
    expected_start_term: get(/(?:start term|start date|intended term|semester)[:\s]+(.+)/i),
    gpa: null,
    credits_completed: null,
  };
}

// ── Process a single email ─────────────────────────────────────────────────

async function processEmail(rawSource) {
  const parsed = await simpleParser(rawSource);

  const fromAddr = parsed.from?.value?.[0];
  const studentEmail = fromAddr?.address?.toLowerCase();
  const studentName = fromAddr?.name?.trim() || null;

  if (!studentEmail) {
    console.warn('[EmailIntake] Could not extract sender email — skipping');
    return;
  }

  // Ignore emails sent by ourselves (prevents processing our own outbound replies)
  if (studentEmail === env.SMTP_USER?.toLowerCase()) {
    console.log('[EmailIntake] Skipping self-sent email — skipping');
    return;
  }

  const subject = parsed.subject || '';
  const body = parsed.text || '';

  console.log(`[EmailIntake] Processing email from ${studentEmail} — "${subject}"`);

  // Extract structured data — fall back to regex if Azure credentials not available
  let openaiClient = null;
  try {
    if (isAgentConfigured()) openaiClient = getProjectClient().getOpenAIClient();
  } catch (err) {
    console.warn('[EmailIntake] Azure client unavailable, using regex extraction:', err.message.split('\n')[0]);
  }
  const aiResult = openaiClient ? await extractWithAI(subject, body, openaiClient) : null;
  const data = (aiResult && Object.keys(aiResult).length > 0) ? aiResult : extractWithRegex(subject, body);

  // Check minimum required fields
  const missing = [];
  if (!data.transfer_from_institution) missing.push('name of the institution you are transferring from');
  if (!data.transfer_to_program) missing.push('the BU program or major you wish to join');

  if (missing.length > 0) {
    console.log(`[EmailIntake] Missing required fields for ${studentEmail}:`, missing);
    await sendInfoRequiredEmail(studentEmail, studentName || data.student_name, missing);
    return;
  }

  // Create the application
  const applicationData = {
    student_name: studentName || data.student_name || 'Unknown (email intake)',
    student_email: studentEmail,
    student_phone: data.student_phone || null,
    transfer_from_institution: data.transfer_from_institution,
    transfer_from_program: data.transfer_from_program || null,
    transfer_to_program: data.transfer_to_program,
    transfer_to_department: data.transfer_to_department || null,
    expected_start_term: data.expected_start_term || null,
    academic_history: {
      gpa: data.gpa || null,
      credits_completed: data.credits_completed || null,
    },
    personal_statement: body || null,
    additional_info: {
      intake_source: 'email',
      original_subject: subject,
    },
  };

  const application = await createApplication(applicationData, 'email', null);
  console.log(`[EmailIntake] Created application ${application.reference_number} for ${studentEmail}`);

  // Upload any PDF attachments as transcripts
  const pdfs = (parsed.attachments || []).filter((a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'));
  for (const att of pdfs) {
    try {
      await uploadDocument({
        buffer: att.content,
        originalName: att.filename || 'transcript.pdf',
        fileSize: att.size || att.content.length,
        mimeType: 'application/pdf',
        applicationId: application.id,
        documentType: 'transcript',
        uploadedBy: null,
        uploadSource: 'email',
        notes: `Attached to email: ${subject}`,
      });
      console.log(`[EmailIntake] Uploaded transcript PDF "${att.filename}" for ${application.reference_number}`);
    } catch (err) {
      console.error(`[EmailIntake] Failed to upload attachment "${att.filename}":`, err.message);
    }
  }

  // The confirmation email is sent by the submission itself (applicant-notification.service)
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
