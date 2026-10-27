import { forbidden } from '../utils/errors.js';

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(forbidden());
  if (!roles.includes(req.user.role)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};

export const requireEvaluator = requireRole('evaluator', 'admin');
export const requireAdmin      = requireRole('admin');
export const requireStudent    = requireRole('student');
