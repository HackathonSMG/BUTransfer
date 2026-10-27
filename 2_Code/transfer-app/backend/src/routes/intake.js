import { Router } from 'express';
import { createApplication } from '../services/application.service.js';
import { badRequest, unauthorized } from '../utils/errors.js';

const router = Router();
const INTAKE_SECRET = process.env.INTAKE_EMAIL_SECRET || 'change-me-intake-secret';

function parseFrom(from) {
  const angleMatch = from.match(/^([^<]*)<([^>]+)>/);
  if (angleMatch) return { name: angleMatch[1].trim() || null, email: angleMatch[2].trim().toLowerCase() };
  const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) return { name: null, email: emailMatch[0].toLowerCase() };
  return { name: null, email: null };
}

function parseEmailBody(body, subject) {
  const extract = (pattern) => { const match = body.match(pattern); return match ? match[1].trim() : null; };
  const subjectNameMatch = subject.match(/transfer application[:\s]+(.+)/i);
  return {
    student_name: extract(/(?:name|student name)[:\s]+(.+)/i) || (subjectNameMatch ? subjectNameMatch[1].trim() : null),
    student_phone: extract(/(?:phone|telephone|mobile)[:\s]+(.+)/i),
    transfer_from_institution: extract(/(?:transferring from|from institution|current institution|university|college)[:\s]+(.+)/i),
    transfer_from_program: extract(/(?:current program|current major|from program)[:\s]+(.+)/i),
    transfer_to_program: extract(/(?:applying to|target program|intended program|to program)[:\s]+(.+)/i),
    transfer_to_department: extract(/(?:department|faculty)[:\s]+(.+)/i),
    expected_start_term: extract(/(?:start term|start date|intended term|semester)[:\s]+(.+)/i),
  };
}

router.post('/email', async (req, res, next) => {
  try {
    const secret = req.headers['x-intake-secret'];
    if (!secret || secret !== INTAKE_SECRET) return next(unauthorized('Invalid or missing X-Intake-Secret header'));

    const { from, subject, body, attachments = [] } = req.body;
    if (!from || !body) return next(badRequest('from and body are required fields'));

    const { name: studentName, email: studentEmail } = parseFrom(from);
    if (!studentEmail) return next(badRequest('Could not extract a valid email address from the "from" field'));

    const parsed = parseEmailBody(body, subject || '');
    const applicationData = {
      student_name: studentName || parsed.student_name || 'Unknown (email intake)',
      student_email: studentEmail,
      student_phone: parsed.student_phone || null,
      transfer_from_institution: parsed.transfer_from_institution || 'Not specified',
      transfer_from_program: parsed.transfer_from_program || null,
      transfer_to_program: parsed.transfer_to_program || 'Not specified',
      transfer_to_department: parsed.transfer_to_department || null,
      expected_start_term: parsed.expected_start_term || null,
      personal_statement: body,
      academic_history: {},
      additional_info: { intake_source: 'email', original_subject: subject, attachment_count: attachments.length, attachment_names: attachments.map((a) => a.filename).filter(Boolean) },
    };

    const application = await createApplication(applicationData, 'email', null);
    return res.status(201).json({ data: { id: application.id, reference_number: application.reference_number, status: application.status, student_email: application.student_email, message: 'Email application ingested successfully' } });
  } catch (err) { return next(err); }
});

export default router;
