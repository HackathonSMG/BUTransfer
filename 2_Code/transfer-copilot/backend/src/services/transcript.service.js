import { pool } from '../config/db.js';
import { evaluateTranscript } from './evaluation.service.js';

/** Resume any transcripts stuck in 'processing' state (e.g. server crash). */
export async function resumeInterruptedJobs() {
  const { rows } = await pool.query(
    `select id from public.transcripts where status = 'processing' and updated_at < now() - interval '5 minutes'`,
  );
  for (const { id } of rows) {
    try {
      await evaluateTranscript(id, 'intake');
      await pool.query(`update public.transcripts set status = 'processed', processed_at = now(), updated_at = now() where id = $1`, [id]);
    } catch (err) {
      console.error(`[transcripts] failed to resume ${id}:`, err.message);
      await pool.query(`update public.transcripts set status = 'failed', updated_at = now() where id = $1`, [id]);
    }
  }
  return rows.length;
}
