// Transcripts received by email, from the Gmail poller and the intake webhook alike. Only the attachments are used:
// the email body is never read, so nothing about the student, the courses or the grades comes from it. Each
// attachment goes through the same transcript reader as an upload; what it finds is the source of truth.
//
//   sender address  -> where updates go (the only thing taken from the email itself, besides the attachments)
//   attachments     -> read as transcripts; those that yield courses are transcripts, the rest supporting documents
//   no transcript   -> a reply asking for the official transcript; nothing is created
//   otherwise       -> draft evaluation, attachments stored, then submitted (so evaluation never starts before the
//                      transcripts are stored), exactly as a website submission
import { env } from '../../config/env.js';
import { createApplication, submitApplication } from '../application.service.js';
import { uploadDocument } from '../document.service.js';
import { readTranscript } from '../credit/credit.service.js';
import { deliverEmail, isSuppressedAddress } from '../email.service.js';
import { renderIntakeReply } from '../notifications/applicant-templates.js';
import { notifyCreditOffice } from '../workflow/lifecycle.service.js';

const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const OTHER_TYPES = { doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
// A file that couldn't be read automatically still counts as a transcript when its name says so (a scan, say);
// the Credit Evaluation Office reads it
const NAMED_TRANSCRIPT = /transcript|academic.?record|grade.?report|marksheet/i;

const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const uniq = (values) => [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];

/** The attachment's type from its declared content type, else its file extension; null when not accepted. */
function typeOf(att) {
  const declared = String(att.contentType || '').toLowerCase().split(';')[0].trim();
  if (Object.values(TYPES).includes(declared) || declared === 'image/jpg') return declared === 'image/jpg' ? 'image/jpeg' : declared;
  if (Object.values(OTHER_TYPES).includes(declared)) return declared;
  return TYPES[extOf(att.filename)] || OTHER_TYPES[extOf(att.filename)] || null;
}

/**
 * @param {{ fromAddress: string, fromName?: string|null, subject?: string, attachments: Array<{ filename?, contentType?, content: Buffer }> }} email
 * @returns {Promise<{ status: 'created'|'no_transcript'|'skipped', reference_number?, transcripts?, supporting?, to_confirm? }>}
 */
export async function ingestEmail({ fromAddress, fromName = null, subject = '', attachments = [] }) {
  const studentEmail = String(fromAddress || '').trim().toLowerCase();
  if (!studentEmail) return { status: 'skipped', reason: 'no sender address' };
  if (env.SMTP_USER && studentEmail === env.SMTP_USER.toLowerCase()) return { status: 'skipped', reason: 'sent by this mailbox' };

  // Read every accepted attachment with the same reader as an upload
  const files = [];
  for (const att of attachments) {
    const mimeType = typeOf(att);
    const name = att.filename || 'attachment';
    if (!mimeType || !att.content?.length) { files.push({ name, ignored: true }); continue; }
    let reading = null;
    if (TYPES[extOf(name)] || Object.values(TYPES).includes(mimeType)) {
      reading = await readTranscript(att.content, { mimeType }).catch((err) => { console.error(`[EmailIntake] Could not read ${name}:`, err.message); return null; });
    }
    const transcript = Boolean(reading?.courses.length) || (Object.values(TYPES).includes(mimeType) && NAMED_TRANSCRIPT.test(name));
    files.push({ name, mimeType, content: att.content, reading, transcript });
  }
  const transcripts = files.filter((f) => f.transcript);
  const supporting = files.filter((f) => !f.transcript && !f.ignored);

  if (!transcripts.length) {
    const reply = renderIntakeReply('no_transcript', { name: fromName, files: files.map((f) => f.name) });
    if (!isSuppressedAddress(studentEmail)) {
      await deliverEmail({ to: studentEmail, ...reply }).catch((err) => console.error('[EmailIntake] Reply not sent:', err.message));
    }
    console.log(`[EmailIntake] ${studentEmail}: no transcript among ${files.length} attachment(s); asked for the official transcript`);
    return { status: 'no_transcript', attachments: files.map((f) => f.name) };
  }

  // Student details come from the transcripts; a value counts only when every transcript that shows it agrees
  const heads = transcripts.map((t) => t.reading?.student || {});
  const agreed = (key) => { const v = uniq(heads.map((h) => h[key])); return v.length === 1 ? v[0] : null; };
  const name = agreed('name');
  const program = agreed('program');
  const startTerm = agreed('start_term');
  const institutions = uniq(transcripts.map((t) => t.reading?.institution));
  const toConfirm = [
    !name && 'student name',
    !program && 'BU program',
    !startTerm && 'BU start term',
    transcripts.some((t) => !t.reading?.courses.length) && 'courses on a transcript that could not be read automatically',
  ].filter(Boolean);

  const application = await createApplication({
    // The sender's display name is from the email header, not the body; it is used only when no transcript names the student
    student_name: name || fromName || 'Name to be confirmed',
    student_email: studentEmail,
    transfer_from_institution: institutions.join('; ') || 'To be confirmed from the transcript',
    transfer_to_program: program || 'To be confirmed',
    expected_start_term: startTerm,
    academic_history: {
      transcript_student_ids: uniq(heads.map((h) => h.student_id)),
      details_from_transcript: ['name', 'program', 'term'].filter((k) => ({ name, program, term: startTerm })[k]),
      details_to_confirm: toConfirm,
    },
    additional_info: { intake_source: 'email', original_subject: subject || null, attachments: files.map((f) => f.name) },
  }, 'email', null, { draft: true });

  for (const f of [...transcripts.map((t) => [t, 'transcript']), ...supporting.map((s) => [s, 'supporting'])]) {
    const [file, documentType] = f;
    await uploadDocument({ buffer: file.content, originalName: file.name, fileSize: file.content.length, mimeType: file.mimeType,
      applicationId: application.id, documentType, uploadedBy: null, uploadSource: 'email', notes: 'Attached to an email' })
      .catch((err) => console.error(`[EmailIntake] Could not store ${file.name}:`, err.message));
  }
  // Submitting starts the evaluation and sends the student the "received" email, as for a website submission
  await submitApplication(application.id, null);

  if (toConfirm.length) {
    await notifyCreditOffice({
      applicationId: application.id, type: 'details_to_confirm', title: `Details to confirm: ${application.reference_number}`,
      message: `Transcripts received by email from ${studentEmail}. To confirm: ${toConfirm.join(', ')}.`,
      data: { reference_number: application.reference_number },
    }).catch(() => {});
  }
  console.log(`[EmailIntake] ${application.reference_number}: ${transcripts.length} transcript(s), ${supporting.length} supporting document(s) from ${studentEmail}`);
  return { status: 'created', reference_number: application.reference_number, transcripts: transcripts.length, supporting: supporting.length, to_confirm: toConfirm };
}

export default { ingestEmail };
