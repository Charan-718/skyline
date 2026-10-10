import { ZodError } from 'zod';
import { AppError, appError } from '../errors.js';

// Maps every error to the envelope { error: { code, message, details, requestId } } (LLD §4.0, §9).
// Unknown errors become 500 INTERNAL_ERROR with a safe message; the stack is logged, never sent.

// Unique-violation constraint name -> domain code. Extended by later tasks.
export const UNIQUE_VIOLATION_CODES = Object.freeze({
  payments_live_booking_uq: 'PAYMENT_ALREADY_PENDING',
  payments_live_order_uq: 'PAYMENT_ALREADY_PENDING',
  payments_live_membership_term_uq: 'PAYMENT_ALREADY_PENDING',
  product_categories_club_name_uq: 'CATEGORY_NAME_TAKEN',
  product_variants_product_id_size_label_key: 'SIZE_EXISTS',
});

function zodToDetails(err) {
  return { fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return appError('VALIDATION_FAILED', zodToDetails(err));
  // body-parser errors
  if (err?.type === 'entity.parse.failed') return appError('VALIDATION_FAILED', { fields: [{ path: '', message: 'Malformed JSON body' }] });
  if (err?.type === 'entity.too.large') return appError('VALIDATION_FAILED', { fields: [{ path: '', message: 'Request body too large' }] });
  if (err?.code === '23505' && UNIQUE_VIOLATION_CODES[err.constraint]) return appError(UNIQUE_VIOLATION_CODES[err.constraint]);
  return null;
}

export function notFoundHandler() {
  return (req, res, next) => next(appError('NOT_FOUND'));
}

export function errorHandler(logger) {
  // Express recognises error middleware by arity, so `next` must stay in the signature.
  return (err, req, res, _next) => {
    let appErr = toAppError(err);
    if (!appErr || appErr.httpStatus >= 500) {
      logger.error(
        { requestId: req.id, userId: req.actor?.userId ?? null, err, code: appErr?.code ?? 'INTERNAL_ERROR' },
        'request failed',
      );
      appErr = appError('INTERNAL_ERROR');
    }
    if (res.headersSent) return;
    res.status(appErr.httpStatus).json({
      error: { code: appErr.code, message: appErr.message, details: appErr.details, requestId: req.id ?? null },
    });
  };
}
