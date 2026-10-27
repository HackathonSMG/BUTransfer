export class AppError extends Error {
  constructor(code, message, status = 500, details = undefined) {
    super(message);
    this.code    = code;
    this.status  = status;
    this.details = details;
  }
}

export const badRequest   = (msg, details) => new AppError('BAD_REQUEST',   msg, 400, details);
export const unauthorized = (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg, 401);
export const forbidden    = (msg = 'Access denied')           => new AppError('FORBIDDEN',    msg, 403);
export const notFound     = (msg = 'Not found')               => new AppError('NOT_FOUND',    msg, 404);
export const conflict     = (msg, details)                    => new AppError('CONFLICT',      msg, 409, details);
export const unprocessable = (msg, details)                   => new AppError('UNPROCESSABLE', msg, 422, details);
export const tooLarge     = (msg = 'Payload too large')       => new AppError('TOO_LARGE',    msg, 413);
export const serverError  = (msg = 'Internal server error')   => new AppError('SERVER_ERROR', msg, 500);
