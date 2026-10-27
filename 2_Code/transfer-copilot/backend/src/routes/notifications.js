import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { pool } from '../config/db.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select * from public.notifications where recipient_profile_id = $1 order by created_at desc limit 50`,
      [req.user.id],
    );
    res.json({ notifications: rows, unread: rows.filter((n) => !n.read_at).length });
  } catch (err) { next(err); }
});

router.post('/read', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (ids && ids.length) {
      await pool.query(
        `update public.notifications set read_at = now() where id = any($1) and recipient_profile_id = $2`,
        [ids, req.user.id],
      );
    } else {
      await pool.query(
        `update public.notifications set read_at = now() where recipient_profile_id = $1 and read_at is null`,
        [req.user.id],
      );
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
