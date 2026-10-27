import { query } from '../config/db.js';
import { notFound } from '../utils/errors.js';

export async function getNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      query(`SELECT n.*, a.reference_number AS application_reference FROM notifications n LEFT JOIN applications a ON a.id = n.application_id WHERE n.recipient_id = $1 ORDER BY n.is_read ASC, n.created_at DESC LIMIT $2 OFFSET $3`, [req.user.id, limit, offset]),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_read = false) AS unread_count FROM notifications WHERE recipient_id = $1`, [req.user.id]),
    ]);
    const { total, unread_count } = countResult.rows[0];
    return res.status(200).json({ data: dataResult.rows, meta: { total: parseInt(total, 10), unread_count: parseInt(unread_count, 10), page, limit, pages: Math.ceil(parseInt(total, 10) / limit) } });
  } catch (err) { return next(err); }
}

export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM notifications WHERE id = $1 AND recipient_id = $2 LIMIT 1`, [id, req.user.id]);
    if (existing.rows.length === 0) return next(notFound('Notification'));
    await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1`, [id]);
    return res.status(200).json({ data: { message: 'Notification marked as read' } });
  } catch (err) { return next(err); }
}

export async function markAllRead(req, res, next) {
  try {
    const result = await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE recipient_id = $1 AND is_read = false`, [req.user.id]);
    return res.status(200).json({ data: { message: 'All notifications marked as read', updated_count: result.rowCount } });
  } catch (err) { return next(err); }
}

export default { getNotifications, markRead, markAllRead };
