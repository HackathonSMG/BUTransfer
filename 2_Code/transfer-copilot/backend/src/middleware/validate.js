import { badRequest } from '../utils/errors.js';

/** Validates req.body / req.query / req.params with a Zod schema */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(badRequest('Validation failed', issues));
  }
  req[source] = result.data;
  next();
};
