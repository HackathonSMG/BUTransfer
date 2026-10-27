/** Truncate a string for safe display in error messages */
export const truncate = (s, n = 80) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/** Parse an integer safely, returning null if NaN */
export const safeInt = (v, fallback = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Parse a float safely, returning null if NaN */
export const safeFloat = (v, fallback = null) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Quarter credits → semester credits (BU rule R2) */
export const quarterToSemester = (credits) =>
  Math.floor((parseFloat(credits) * 2) / 3 * 100) / 100;

/** Paginate a SQL result using a cursor (last id seen) */
export const toCursorPage = (rows, limit, idField = 'id') => ({
  data:       rows.slice(0, limit),
  nextCursor: rows.length > limit ? rows[limit - 1]?.[idField] ?? null : null,
  hasMore:    rows.length > limit,
});
