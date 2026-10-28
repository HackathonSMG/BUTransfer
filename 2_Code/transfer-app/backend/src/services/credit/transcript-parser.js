// Reads course rows from a transcript PDF. First tries the structured column-layout parser for the
// hackathon sample format; falls back to an AI-based extraction (via Azure OpenAI) for any other layout.
// Student identity is not extracted.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const TERM = /^(Winter|Spring|Summer|Fall)\s+\d{4}$/;
// A+ is a valid letter grade (policy.js scores it 4.3); without it an A+ row was silently dropped
const GRADE = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|W|P|I)$/;
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

/** The text of a PDF (e.g. a syllabus), line by line; empty when the PDF has no text layer. */
export async function extractText(buffer) {
  return (await readLines(buffer)).map((l) => l.text).join('\n').trim();
}

/**
 * Structured-layout parser for the hackathon sample transcript format.
 * @returns {{ institution, credit_system, courses }} — courses is empty if layout not recognised
 */
function parseStructured(lines) {
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
    const cells = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const it of line.items) {
      const col = [...columns].reverse().find((c) => it.x >= c.x - 2) || columns[0];
      cells[col.name].push(it.s);
    }
    const code = cells.COURSE.join(' ').replace(/\s+/g, ' ').trim();
    const grade = cells.GRADE.join('').trim();
    // A blank credits cell stays null (the engine then asks for the credits); it is never read as 0 credits
    const creditsText = cells.ATTEMPTED.join('').replace(/[^0-9.]/g, '');
    const attempted = creditsText === '' ? null : Number(creditsText);
    if (!code || !GRADE.test(grade) || (attempted !== null && !Number.isFinite(attempted))) continue;
    courses.push({ course_code: code, title: cells.TITLE.join(' ').trim(), term, source_credits: attempted, grade });
  }
  return { institution, credit_system, courses };
}

const AI_SYSTEM_PROMPT = `Extract transcript data from the text and return ONLY valid JSON with this exact structure:
{
  "institution": "Full institution name or null",
  "credit_system": "Semester" or "Quarter" or null,
  "courses": [
    { "course_code": "DEPT 101", "title": "Course Title", "term": "Fall 2023", "source_credits": 3, "grade": "A" }
  ]
}
Rules: grade must be one of A+ A A- B+ B B- C+ C C- D+ D D- F W P I. source_credits must be a number.
Omit any row where grade or credits are missing. Do not include student name, ID, or contact info.`;

/**
 * AI-based fallback parser — uses Azure OpenAI to extract courses from any transcript layout.
 * @param {string} rawText — all text lines joined
 * @param {object} openaiClient — Azure OpenAI-compatible client from getProjectClient().getOpenAIClient()
 */
async function aiParseTranscript(rawText, openaiClient) {
  const { env } = await import('../../config/env.js');
  const model = env.FOUNDRY_MODEL_DEPLOYMENT || 'gpt-4o-mini';

  const response = await openaiClient.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: rawText.slice(0, 12000) }, // cap to stay within token limits
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  const VALID_GRADE = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|W|P|I)$/;
  return {
    institution: parsed.institution || null,
    credit_system: parsed.credit_system || null,
    courses: (parsed.courses || []).filter(
      (c) => c.course_code && VALID_GRADE.test(String(c.grade || '').trim()) && Number.isFinite(Number(c.source_credits))
    ).map((c) => ({
      course_code: String(c.course_code).trim(),
      title: String(c.title || '').trim(),
      term: String(c.term || '').trim() || null,
      source_credits: Number(c.source_credits),
      grade: String(c.grade).trim(),
    })),
  };
}

/**
 * @param {Buffer} buffer PDF bytes
 * @param {object} [openaiClient] Azure OpenAI client — if provided, used as fallback for unknown layouts
 * @returns {Promise<{ institution: string|null, credit_system: string|null, courses: Array<{course_code, title, term, source_credits, grade}> }>}
 */
export async function parseTranscript(buffer, openaiClient = null) {
  const lines = await readLines(buffer);
  const structured = parseStructured(lines);

  if (structured.courses.length > 0) return structured;

  // Layout not recognised — try AI extraction if a client was provided
  if (!openaiClient) return structured;

  console.log('[Transcript] Structured parser found no courses — attempting AI extraction');
  try {
    const rawText = lines.map((l) => l.text).join('\n');
    const aiResult = await aiParseTranscript(rawText, openaiClient);
    if (aiResult.courses.length > 0) {
      console.log(`[Transcript] AI extracted ${aiResult.courses.length} courses from ${aiResult.institution || 'unknown institution'}`);
      return aiResult;
    }
  } catch (err) {
    console.error('[Transcript] AI extraction failed:', err.message);
  }
  return structured;
}
