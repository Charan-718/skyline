import { AppError } from '../errors.js';
import { logger } from '../logger.js';

export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || 'unknown';

  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: {
          fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        requestId,
      },
    });
  }

  logger.error({ err, requestId }, 'Unhandled error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {},
      requestId,
    },
  });
}
