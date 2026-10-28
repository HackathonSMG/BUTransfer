import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { uploadFile, getFileUrl, deleteFile } from '../utils/storage.js';
import { notFound, forbidden } from '../utils/errors.js';
import { importTranscript } from './credit/credit.service.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function uploadDocument({ buffer, originalName, fileSize, mimeType, applicationId, documentType = 'other', uploadedBy = null, uploadSource = 'student', notes = null }) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed. Supported types: PDF, JPG, PNG, DOC, DOCX.`);
  }
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const storagePath = `applications/${applicationId}/${uuidv4()}${ext}`;
  const { path: storedPath } = await uploadFile(buffer, storagePath, mimeType);
  const result = await query(
    `INSERT INTO application_documents (application_id, document_type, file_name, storage_path, file_size, mime_type, uploaded_by, upload_source, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [applicationId, documentType, originalName, storedPath, fileSize, mimeType, uploadedBy, uploadSource, notes]
  );
  const document = result.rows[0];

  // Read course rows from transcript PDFs so the credit evaluation can use them; a transcript
  // in another layout is still stored, it just contributes no courses
  if (documentType === 'transcript' && mimeType === 'application/pdf') {
    try {
      document.transcript_import = await importTranscript(applicationId, document.id, buffer);
    } catch (err) {
      console.error(`[Transcript] Could not read courses from ${originalName}:`, err.message);
      document.transcript_import = { institution: null, courses: 0, error: err.message };
    }
  }
  return document;
}

export async function getDocument(documentId, requestorId = null) {
  const result = await query(
    `SELECT ad.*, a.student_profile_id, a.assigned_evaluator_id FROM application_documents ad JOIN applications a ON a.id = ad.application_id WHERE ad.id = $1 LIMIT 1`,
    [documentId]
  );
  if (result.rows.length === 0) throw notFound('Document');
  const document = result.rows[0];

  if (requestorId) {
    const profileResult = await query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [requestorId]);
    const role = profileResult.rows[0]?.role;
    const isOwner = document.student_profile_id === requestorId;
    const isOffice = role === 'admin' || role === 'credit_office';
    // An evaluator sees documents only for applications with a course assigned to them
    let isReviewer = false;
    if (role === 'evaluator') {
      const { rows } = await query(`SELECT 1 FROM course_reviews WHERE application_id = $1 AND evaluator_id = $2 LIMIT 1`, [document.application_id, requestorId]);
      isReviewer = rows.length > 0 || document.assigned_evaluator_id === requestorId;
    }
    if (!isOwner && !isOffice && !isReviewer) throw forbidden('You do not have access to this document');
  }

  const url = await getFileUrl(document.storage_path, 3600);
  return { document, url };
}

export async function listDocuments(applicationId) {
  const result = await query(
    `SELECT ad.*, p.full_name AS uploaded_by_name FROM application_documents ad LEFT JOIN profiles p ON p.id = ad.uploaded_by WHERE ad.application_id = $1 ORDER BY ad.created_at ASC`,
    [applicationId]
  );
  return result.rows;
}

export async function removeDocument(documentId, requestorId) {
  const result = await query(`SELECT ad.* FROM application_documents ad WHERE ad.id = $1 LIMIT 1`, [documentId]);
  if (result.rows.length === 0) throw notFound('Document');
  const doc = result.rows[0];
  const profileResult = await query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [requestorId]);
  const role = profileResult.rows[0]?.role;
  if (role !== 'admin' && doc.uploaded_by !== requestorId) throw forbidden('You are not authorised to delete this document');
  await deleteFile(doc.storage_path);
  await query(`DELETE FROM application_documents WHERE id = $1`, [documentId]);
}

/**
 * Removes a document the applicant attached to a draft (before submission). Courses read from a transcript go
 * with it (transcript_courses.document_id cascades). Submitted applications keep every document.
 */
export async function removeDraftDocument(application, documentId) {
  if (application.status !== 'draft') throw forbidden('Documents can only be removed before the application is submitted');
  const { rows: [doc] } = await query(`SELECT id, storage_path FROM application_documents WHERE id = $1 AND application_id = $2`, [documentId, application.id]);
  if (!doc) throw notFound('Document');
  await query(`DELETE FROM application_documents WHERE id = $1`, [doc.id]);
  await deleteFile(doc.storage_path).catch((err) => console.error('[Documents] Stored file not removed:', err.message));
}

export default { uploadDocument, getDocument, listDocuments, removeDocument, removeDraftDocument };
