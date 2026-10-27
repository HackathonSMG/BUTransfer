import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator } from '../middleware/require-role.js';
import { pool } from '../config/db.js';

const router = Router();
router.use(authenticate, requireEvaluator);

router.get('/course-matches', async (req, res, next) => {
  try {
    // Pivot: one row per BU course with per-institution match columns
    const { rows: raw } = await pool.query(
      `select c.code as bu_course, c.title as bu_title, c.program_area as program,
              c.requirement_group as requirement_group,
              wcm.partner_institution_id,
              i.short_name as institution_short,
              wcm.partner_course_code,
              wcm.match_level,
              wcm.notes
       from public.courses c
       join public.worksheet_course_matches wcm on wcm.target_course_id = c.id
       join public.institutions i on i.id = wcm.partner_institution_id
       order by c.code, i.short_name`,
    );

    // Pivot by BU course
    const byCode = {};
    for (const r of raw) {
      if (!byCode[r.bu_course]) {
        byCode[r.bu_course] = {
          bu_course: r.bu_course,
          bu_title: r.bu_title,
          program: r.program,
          requirement_group: r.requirement_group,
          notes: null,
        };
      }
      const short = (r.institution_short || '').toLowerCase();
      byCode[r.bu_course][`${short}_course`]     = r.partner_course_code;
      byCode[r.bu_course][`${short}_match_level`] = r.match_level;
      if (r.notes) byCode[r.bu_course].notes = r.notes;
    }

    const items = Object.values(byCode);
    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});

router.get('/rules', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`select * from public.transfer_rules order by id`);
    res.json({ rules: rows });
  } catch (err) { next(err); }
});

router.get('/seasons/current', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`select * from public.seasons where is_current = true limit 1`);
    res.json({ season: rows[0] || null });
  } catch (err) { next(err); }
});

export default router;
