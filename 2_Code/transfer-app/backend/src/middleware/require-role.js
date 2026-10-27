import { forbidden } from '../utils/errors.js';

/**
 * Factory middleware restricting access to specific user roles.
 * Usage: router.use(requireRole('admin', 'evaluator'));
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden('Authentication required before role check'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`));
    }
    return next();
  };
}

export default requireRole;
