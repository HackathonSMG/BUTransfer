// What was confirmed for a transcript on the review step (a JSON form field): { institution?, courses? }.
// Used by the student upload and by staff uploading on a student's behalf. Malformed or oversized input is
// ignored, and the transcript's own reading is stored.
export function reviewedOf(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(String(raw).slice(0, 200_000));
    const courses = Array.isArray(v?.courses) && v.courses.length <= 300
      ? v.courses.map((c) => ({ course_code: c?.course_code, title: c?.title, term: c?.term, source_credits: c?.credits ?? c?.source_credits, grade: c?.grade }))
      : null;
    return { institution: typeof v?.institution === 'string' ? v.institution : null, courses };
  } catch { return null; }
}

export default reviewedOf;
