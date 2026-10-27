import { pool } from '../config/db.js';
import { evaluateTranscript } from './evaluation.service.js';

async function processQueued() {
  const { rows } = await pool.query(
    `select t.id from public.transcripts t
     where t.status = 'received'
       and (t.process_after is null or t.process_after <= now())
     order by t.process_after asc nulls first
     limit 5`,
  );
  for (const row of rows) {
    await pool.query(`update public.transcripts set status = 'processing', updated_at = now() where id = $1`, [row.id]);
    try {
      await evaluateTranscript(row.id, 'intake');
      await pool.query(`update public.transcripts set status = 'processed', processed_at = now(), updated_at = now() where id = $1`, [row.id]);
    } catch (err) {
      console.error(`[intake] failed to process transcript ${row.id}:`, err.message);
      await pool.query(`update public.transcripts set status = 'failed', updated_at = now() where id = $1`, [row.id]);
    }
  }
}

export function startIntakeWorker(intervalMs) {
  if (!intervalMs || intervalMs <= 0) return () => {};
  const id = setInterval(() => processQueued().catch((e) => console.error('[intake] worker error:', e.message)), intervalMs);
  return () => clearInterval(id);
}
