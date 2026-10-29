import { Router } from 'express';
import { ingestEmail } from '../services/intake/email-intake.service.js';
import { badRequest, unauthorized } from '../utils/errors.js';

// Email intake webhook (for a mail service that forwards incoming email as JSON). Only the sender and the attachments
// are used; the email body is ignored, as in the Gmail poller. Body:
//   { from: "Name <address>", subject?, attachments: [{ filename, content_type, content_base64 }] }
const router = Router();
const INTAKE_SECRET = process.env.INTAKE_EMAIL_SECRET || 'change-me-intake-secret';
const MAX_ATTACHMENTS = 10;

function parseFrom(from) {
  const angleMatch = String(from || '').match(/^([^<]*)<([^>]+)>/);
  if (angleMatch) return { name: angleMatch[1].trim().replace(/^"|"$/g, '') || null, email: angleMatch[2].trim().toLowerCase() };
  const emailMatch = String(from || '').match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) return { name: null, email: emailMatch[0].toLowerCase() };
  return { name: null, email: null };
}

router.post('/email', async (req, res, next) => {
  try {
    const secret = req.headers['x-intake-secret'];
    if (!secret || secret !== INTAKE_SECRET) return next(unauthorized('Invalid or missing X-Intake-Secret header'));

    const { from, subject, attachments = [] } = req.body || {};
    const { name, email } = parseFrom(from);
    if (!email) return next(badRequest('Could not read a valid email address from the "from" field'));
    if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) return next(badRequest(`attachments must be a list of at most ${MAX_ATTACHMENTS} files`));

    const files = attachments.map((a) => ({
      filename: a?.filename, contentType: a?.content_type || a?.contentType,
      content: typeof a?.content_base64 === 'string' ? Buffer.from(a.content_base64, 'base64') : null,
    }));
    const result = await ingestEmail({ fromAddress: email, fromName: name, subject: subject || '', attachments: files });
    if (result.status === 'created') {
      return res.status(201).json({ data: { ...result, message: 'Transcripts received; credit evaluation started' } });
    }
    return res.status(200).json({ data: { ...result, message: result.status === 'no_transcript' ? 'No transcript among the attachments; the sender was asked for it' : 'Email skipped' } });
  } catch (err) { return next(err); }
});

export default router;
