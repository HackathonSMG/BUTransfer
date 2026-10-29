// Reads course rows from a transcript PDF. First tries the structured column-layout parser: terms ("Fall 2024")
// followed by a course table whose headings may use the common registrar variants ("Credits Att", "Course Title",
// "Quality Points"…), with the institution either as "Course record from …" or as the page title. Falls back to an
// AI-based extraction (via Azure OpenAI, when configured) for any other layout.
// The structured parser also reads the header block (student name, student ID, BU major, BU start term) so the
// student can confirm it instead of typing it; the AI fallback never extracts identity.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const TERM = /^(Winter|Spring|Summer|Fall)\s+\d{4}$/;
// A+ is a valid letter grade (policy.js scores it 4.3); without it an A+ row was silently dropped
const GRADE = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|W|P|I)$/;
const COLUMNS = ['COURSE', 'TITLE', 'ATTEMPTED', 'EARNED', 'GRADE', 'QUALITY PTS'];
// Column headings registrars commonly print, compared without case or punctuation -> the column they mean.
// A course table needs a course, a title, a grade and a credits column (attempted, or earned when only that exists).
const COLUMN_ALIASES = {
  COURSE: 'COURSE', 'COURSE CODE': 'COURSE', 'COURSE NO': 'COURSE', 'COURSE NUMBER': 'COURSE', 'COURSE ID': 'COURSE', SUBJECT: 'COURSE',
  TITLE: 'TITLE', 'COURSE TITLE': 'TITLE', DESCRIPTION: 'TITLE', 'COURSE NAME': 'TITLE',
  ATTEMPTED: 'ATTEMPTED', 'CREDITS ATT': 'ATTEMPTED', 'CREDITS ATTEMPTED': 'ATTEMPTED', 'ATT CREDITS': 'ATTEMPTED', 'ATT HRS': 'ATTEMPTED',
  'HOURS ATTEMPTED': 'ATTEMPTED', 'UNITS ATTEMPTED': 'ATTEMPTED', CREDITS: 'ATTEMPTED', CREDIT: 'ATTEMPTED', UNITS: 'ATTEMPTED', HOURS: 'ATTEMPTED',
  'CREDIT HOURS': 'ATTEMPTED', CR: 'ATTEMPTED', HRS: 'ATTEMPTED',
  EARNED: 'EARNED', 'CREDITS EARNED': 'EARNED', 'EARNED CREDITS': 'EARNED', 'HOURS EARNED': 'EARNED', 'UNITS EARNED': 'EARNED', 'ERN HRS': 'EARNED',
  GRADE: 'GRADE', 'FINAL GRADE': 'GRADE', GRD: 'GRADE',
  'QUALITY PTS': 'QUALITY PTS', 'QUALITY POINTS': 'QUALITY PTS', 'GRADE POINTS': 'QUALITY PTS', POINTS: 'QUALITY PTS', QP: 'QUALITY PTS', QPTS: 'QUALITY PTS',
};
const headingKey = (text) => String(text).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The columns of a course-table heading line, by x position, or null when the line is not one. */
function tableColumns(line) {
  const found = new Map();
  for (const it of line.items) {
    const name = COLUMN_ALIASES[headingKey(it.s)];
    if (name && !found.has(name)) found.set(name, it.x);
  }
  if (!found.has('COURSE') || !found.has('TITLE') || !found.has('GRADE') || !(found.has('ATTEMPTED') || found.has('EARNED'))) return null;
  return [...found.entries()].map(([name, x]) => ({ name, x })).sort((a, b) => a.x - b.x);
}

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

// Header labels of the sample format -> field (null: a label we recognise but do not use)
const HEADER_LABELS = {
  STUDENT: 'name', 'STUDENT NAME': 'name', NAME: 'name', 'STUDENT ID': 'student_id', ID: 'student_id',
  'INTENDED BU MAJOR': 'program', 'BU MAJOR': 'program', MAJOR: 'program', PROGRAM: 'program',
  'BU START': 'start_term', 'START TERM': 'start_term', INSTITUTION: null, 'DATE PREPARED': null,
};

// Watermark-style tags printed next to header values in the sample files; never part of a value
const HEADER_BADGES = new Set(['SYNTHETIC', 'WORKSHEET', 'TEST', 'SAMPLE', 'UNOFFICIAL']);
const labelKey = (text) => text.toUpperCase().replace(/\s*\(.*\)\s*$/, '').trim();

/**
 * The header block: a row of labels with their values just below, matched by column position. Values are taken
 * from the text within one line-height below the labels, so a tag printed slightly off the baseline is ignored.
 * @returns {{ name?, student_id?, program?, start_term? }} only the fields found
 */
function parseHeader(lines) {
  const out = {};
  for (let i = 0; i < lines.length - 1; i++) {
    const row = lines[i];
    const isLabel = (it) => it.s === it.s.toUpperCase() && Object.prototype.hasOwnProperty.call(HEADER_LABELS, labelKey(it.s));
    if (!row.items.length || !row.items.every(isLabel)) continue; // a label row holds labels only
    const below = lines.slice(i + 1).filter((l) => l.page === row.page && l.y < row.y && row.y - l.y <= 20);
    const values = below.flatMap((l) => l.items).filter((v) => !HEADER_BADGES.has(v.s.toUpperCase()));
    row.items.forEach((label, j) => {
      const key = HEADER_LABELS[labelKey(label.s)];
      const next = row.items[j + 1];
      const text = values.filter((v) => v.x >= label.x - 3 && (!next || v.x < next.x - 3)).map((v) => v.s).join(' ').trim();
      if (key && text && !out[key]) out[key] = text;
    });
  }
  return out;
}

/**
 * Structured-layout parser for the hackathon sample transcript format.
 * @returns {{ institution, credit_system, courses }} — courses is empty if layout not recognised
 */
function parseStructured(lines) {
  const header = lines.find((l) => l.text.startsWith('Course record from '));
  const institution = header ? header.text.replace('Course record from ', '').trim() : institutionTitle(lines);
  const calendar = lines.find((l) => /Calendar:\s*(Quarter|Semester) system/i.test(l.text));
  const student = { ...parseInlineHeader(lines), ...parseHeader(lines) };
  const credit_system = calendar ? (/Quarter/i.test(calendar.text) ? 'Quarter' : 'Semester') : student.calendar || null;
  delete student.calendar;

  const courses = [];
  let term = null;
  let columns = null;
  for (const line of lines) {
    if (TERM.test(line.text)) { term = line.text; columns = null; continue; }
    const heading = tableColumns(line);
    if (heading) { columns = heading; continue; }
    if (!columns || !term) continue;
    const cells = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const it of line.items) {
      const col = [...columns].reverse().find((c) => it.x >= c.x - 2) || columns[0];
      cells[col.name].push(it.s);
    }
    const code = cells.COURSE.join(' ').replace(/\s+/g, ' ').trim();
    const grade = cells.GRADE.join('').trim();
    // A blank credits cell stays null (the engine then asks for the credits); it is never read as 0 credits.
    // Credits attempted are used; a table that only prints credits earned uses those.
    const creditsText = (columns.some((c) => c.name === 'ATTEMPTED') ? cells.ATTEMPTED : cells.EARNED).join('').replace(/[^0-9.]/g, '');
    const attempted = creditsText === '' ? null : Number(creditsText);
    if (!code || !GRADE.test(grade) || (attempted !== null && !Number.isFinite(attempted))) continue;
    courses.push({ course_code: code, title: cells.TITLE.join(' ').trim(), term, source_credits: attempted, grade });
  }
  return { institution, credit_system, courses, student };
}

const INSTITUTION_WORDS = /\b(college|university|institute|school|academy|polytechnic)\b/i;
const NOT_A_NAME = /\b(office|registrar|transcript|department|record|issued|page|sample|synthetic|student)\b/i;

/**
 * The issuing institution when the transcript prints it as the page title rather than "Course record from …":
 * the first line on page 1, above the first term, that names a college or university and nothing else.
 */
function institutionTitle(lines) {
  const firstTerm = lines.findIndex((l) => TERM.test(l.text));
  const top = lines.slice(0, firstTerm === -1 ? 8 : firstTerm).filter((l) => l.page === 1);
  const line = top.find((l) => l.items.length === 1 && INSTITUTION_WORDS.test(l.text) && !NOT_A_NAME.test(l.text) && l.text.length <= 90);
  return line ? line.text.trim() : null;
}

// Header labels printed beside their value ("Student  Maya Chen  Student ID  RFCC-204871"). A plain "Program" here
// is the program at the previous college, never the BU major, so only explicit BU labels fill the BU program.
const INLINE_LABELS = {
  STUDENT: 'name', 'STUDENT NAME': 'name', NAME: 'name', 'STUDENT ID': 'student_id', ID: 'student_id', 'STUDENT NUMBER': 'student_id',
  'INTENDED BU MAJOR': 'program', 'BU MAJOR': 'program', 'BU PROGRAM': 'program', 'BU START': 'start_term', 'BU START TERM': 'start_term',
  'ACADEMIC CALENDAR': 'calendar', CALENDAR: 'calendar',
};
const ANY_LABEL = new Set([...Object.keys(INLINE_LABELS), ...Object.keys(HEADER_LABELS), 'PROGRAM', 'DATE ISSUED', 'STATUS', 'INSTITUTION']);

/** Label/value pairs on the same line, above the first term. Returns only the fields found. */
function parseInlineHeader(lines) {
  const out = {};
  const firstTerm = lines.findIndex((l) => TERM.test(l.text));
  for (const line of lines.slice(0, firstTerm === -1 ? 12 : firstTerm)) {
    line.items.forEach((it, j) => {
      const key = INLINE_LABELS[labelKey(it.s).replace(/:$/, '')];
      const value = line.items[j + 1]?.s?.trim();
      if (!key || !value || ANY_LABEL.has(labelKey(value).replace(/:$/, '')) || out[key]) return;
      if (key === 'calendar') {
        if (/quarter/i.test(value)) out.calendar = 'Quarter';
        else if (/semester/i.test(value)) out.calendar = 'Semester';
        return;
      }
      out[key] = value;
    });
  }
  return out;
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
