// Reads course rows from a transcript PDF laid out like the hackathon sample transcripts
// (4_Sample_Transcripts): a header naming the institution and calendar, then per-term tables with
// COURSE / TITLE / ATTEMPTED / EARNED / GRADE / QUALITY PTS columns. Student identity is not extracted.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const TERM = /^(Winter|Spring|Summer|Fall)\s+\d{4}$/;
const GRADE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|W|P|I)$/;
const COLUMNS = ['COURSE', 'TITLE', 'ATTEMPTED', 'EARNED', 'GRADE', 'QUALITY PTS'];

async function readLines(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const byY = new Map();
    for (const it of items) {
      const [, skew, , , x, y] = it.transform;
      if (!it.str.trim() || Math.abs(skew) > 0.01) continue; // skip blanks and the rotated watermark
      const key = `${p}:${Math.round(y)}`;
      if (!byY.has(key)) byY.set(key, { page: p, y: Math.round(y), items: [] });
      byY.get(key).items.push({ x, s: it.str.trim() });
    }
    lines.push(...[...byY.values()].sort((a, b) => b.y - a.y));
  }
  await doc.destroy();
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.s).join(' ');
  }
  return lines;
}

/**
 * @param {Buffer} buffer PDF bytes
 * @returns {Promise<{ institution: string|null, credit_system: string|null, courses: Array<{course_code, title, term, source_credits, grade}> }>}
 */
export async function parseTranscript(buffer) {
  const lines = await readLines(buffer);
  const header = lines.find((l) => l.text.startsWith('Course record from '));
  const institution = header ? header.text.replace('Course record from ', '').trim() : null;
  const calendar = lines.find((l) => /Calendar:\s*(Quarter|Semester) system/i.test(l.text));
  const credit_system = calendar ? (/Quarter/i.test(calendar.text) ? 'Quarter' : 'Semester') : null;

  const courses = [];
  let term = null;
  let columns = null;
  for (const line of lines) {
    if (TERM.test(line.text)) { term = line.text; columns = null; continue; }
    if (COLUMNS.every((c) => line.items.some((i) => i.s === c))) {
      columns = COLUMNS.map((name) => ({ name, x: line.items.find((i) => i.s === name).x }));
      continue;
    }
    if (!columns || !term) continue;

    // Each value belongs to the right-most column header that starts at or before it
    const cells = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const it of line.items) {
      const col = [...columns].reverse().find((c) => it.x >= c.x - 2) || columns[0];
      cells[col.name].push(it.s);
    }
    const code = cells.COURSE.join(' ').replace(/\s+/g, ' ').trim();
    const grade = cells.GRADE.join('').trim();
    const attempted = Number(cells.ATTEMPTED.join('').replace(/[^0-9.]/g, ''));
    if (!code || !GRADE.test(grade) || !Number.isFinite(attempted)) continue;
    courses.push({ course_code: code, title: cells.TITLE.join(' ').trim(), term, source_credits: attempted, grade });
  }
  return { institution, credit_system, courses };
}
