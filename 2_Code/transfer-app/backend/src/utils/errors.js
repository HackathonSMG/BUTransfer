/**
 * Custom application error class.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFound(resource = 'Resource') {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(message, 401, 'UNAUTHORIZED');
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new AppError(message, 403, 'FORBIDDEN');
}

export function badRequest(message = 'Invalid request', details = null) {
  return new AppError(message, 400, 'BAD_REQUEST', details);
}

export function conflict(message = 'Resource already exists') {
  return new AppError(message, 409, 'CONFLICT');
}

export function unprocessable(message = 'Unprocessable entity', details = null) {
  return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
}

export function internalError(message = 'An unexpected error occurred') {
  return new AppError(message, 500, 'INTERNAL_ERROR');
}

export default { AppError, notFound, unauthorized, forbidden, badRequest, conflict, unprocessable, internalError };
