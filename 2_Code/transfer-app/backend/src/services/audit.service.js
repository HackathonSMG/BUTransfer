import { query } from '../config/db.js';

export async function log({ applicationId = null, action, actorId = null, actorRole = null, actorEmail = null, oldValue = null, newValue = null, details = {}, ipAddress = null }) {
  const result = await query(
    `INSERT INTO audit_logs (application_id, action, actor_id, actor_role, actor_email, old_value, new_value, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [applicationId, action, actorId, actorRole, actorEmail,
     oldValue ? JSON.stringify(oldValue) : null,
     newValue ? JSON.stringify(newValue) : null,
     JSON.stringify(details), ipAddress]
  );
  return result.rows[0];
}

export async function getApplicationAuditLog(applicationId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT al.*, p.full_name AS actor_name FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_id WHERE al.application_id = $1 ORDER BY al.created_at DESC LIMIT $2 OFFSET $3`,
      [applicationId, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM audit_logs WHERE application_id = $1`, [applicationId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].total, 10) };
}

export async function listAuditLogs({ action, actorId, page = 1, limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;
  if (action) { conditions.push(`al.action = $${idx++}`); params.push(action); }
  if (actorId) { conditions.push(`al.actor_id = $${idx++}`); params.push(actorId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const dataResult = await query(
    `SELECT al.*, p.full_name AS actor_name, a.reference_number AS application_reference
     FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_id LEFT JOIN applications a ON a.id = al.application_id
     ${where} ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );
  const countResult = await query(`SELECT COUNT(*) AS total FROM audit_logs al ${where}`, params);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].total, 10) };
}

export default { log, getApplicationAuditLog, listAuditLogs };
