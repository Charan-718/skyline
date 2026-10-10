// AppError — Group 1 (explicit HTTP) + Group 2 (ERROR_CODES registry + appError).

export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT_STATE: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  VERIFICATION_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
  PAYMENT_ALREADY_PENDING: 409,
  LEDGER_CONFLICT: 500,
  FIELD_NOT_EDITABLE: 403,
  ASSIGNEE_NOT_IN_CLUB: 422,
  FUNDRAISER_CLOSED: 409,
  RECEIPT_REQUIRED: 400,
  UNSUPPORTED_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  EVENT_NOT_IN_CLUB: 422,
  FUNDRAISER_NOT_IN_CLUB: 422,
  SELF_APPROVAL_FORBIDDEN: 403,
  SELF_PAYOUT_FORBIDDEN: 403,
  BUDGET_PERIOD_OVERLAP: 409,
  CATEGORY_NAME_TAKEN: 409,
  SIZE_EXISTS: 409,
  STOCK_BELOW_RESERVED: 422,
  MEMBERS_ONLY_PRODUCT: 422,
  PRODUCT_NOT_ORDERABLE: 422,
  OUT_OF_STOCK: 409,
  PRICE_CHANGED: 409,
  TOO_MANY_ITEMS: 400,
  PICKUP_CODE_NOT_FOUND: 404,
  ORDER_NOT_READY: 409,
  ALREADY_PICKED_UP: 409,
});

const DEFAULT_MESSAGES = {
  VALIDATION_FAILED: 'The request is invalid.',
  IDEMPOTENCY_KEY_REQUIRED: 'An Idempotency-Key header (UUID) is required for this request.',
  UNAUTHENTICATED: 'Please sign in.',
  FORBIDDEN: 'You do not have permission to do this.',
  NOT_FOUND: 'Not found.',
  CONFLICT_STATE: 'This action is not allowed in the current state.',
  IDEMPOTENCY_KEY_REUSED: 'This Idempotency-Key was already used for a different request.',
  REQUEST_IN_PROGRESS: 'An identical request is still being processed.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  VERIFICATION_UNAVAILABLE: 'The verification service is unavailable.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  PAYMENT_ALREADY_PENDING: 'A payment is already in progress for this item.',
  LEDGER_CONFLICT: 'Something went wrong. Please try again.',
  FIELD_NOT_EDITABLE: 'You cannot change this field.',
  ASSIGNEE_NOT_IN_CLUB: 'The assignee must hold a role in this club.',
  FUNDRAISER_CLOSED: 'This fundraiser is completed or cancelled.',
  RECEIPT_REQUIRED: 'A receipt file is required.',
  UNSUPPORTED_FILE_TYPE: 'Only JPEG, PNG or PDF files are accepted.',
  FILE_TOO_LARGE: 'The file is larger than 5 MB.',
  EVENT_NOT_IN_CLUB: 'The event does not belong to this club.',
  FUNDRAISER_NOT_IN_CLUB: 'The fundraiser does not belong to this club.',
  SELF_APPROVAL_FORBIDDEN: 'You cannot review your own claim.',
  SELF_PAYOUT_FORBIDDEN: 'You cannot pay out a claim made to yourself.',
  BUDGET_PERIOD_OVERLAP: 'This budget period overlaps another budget of the club.',
  CATEGORY_NAME_TAKEN: 'A category with this name already exists.',
  SIZE_EXISTS: 'This size already exists for the product.',
  STOCK_BELOW_RESERVED: 'Stock on hand cannot go below the quantity reserved for open orders.',
  MEMBERS_ONLY_PRODUCT: 'This product is available to members only.',
  PRODUCT_NOT_ORDERABLE: 'This product cannot be ordered right now.',
  OUT_OF_STOCK: 'Not enough stock for this size.',
  PRICE_CHANGED: 'The price has changed. Please review the new total.',
  TOO_MANY_ITEMS: 'An order can have at most 10 lines.',
  PICKUP_CODE_NOT_FOUND: 'No order with this pickup code.',
  ORDER_NOT_READY: 'This order is not ready for pickup.',
  ALREADY_PICKED_UP: 'This order has already been picked up.',
};

export class AppError extends Error {
  /**
   * @param {string} code
   * @param {number} [httpStatus]
   * @param {string} [message]
   * @param {Record<string, unknown> | null} [details]
   */
  constructor(code, httpStatus, message, details) {
    if (code in ERROR_CODES) {
      const status = httpStatus ?? ERROR_CODES[code];
      if (httpStatus != null && status !== ERROR_CODES[code]) {
        throw new Error(`Error code ${code} must use HTTP ${ERROR_CODES[code]}, got ${httpStatus}`);
      }
      super(message ?? DEFAULT_MESSAGES[code] ?? code);
      this.httpStatus = status;
      this.details = details ?? null;
    } else {
      if (httpStatus == null) {
        throw new Error(`Undocumented error code: ${code}`);
      }
      super(message ?? code);
      this.httpStatus = httpStatus;
      this.details = details ?? {};
    }
    this.name = 'AppError';
    this.code = code;
  }
}

/** Shorthand for LLD-registered codes: appError('NOT_FOUND') or appError('CONFLICT_STATE', { currentStatus }). */
export function appError(code, details, message) {
  return new AppError(code, ERROR_CODES[code], message, details);
}

export const isAppError = (err) => err instanceof AppError;

export function assertFound(value, message = 'Resource not found') {
  if (value == null) {
    throw new AppError('NOT_FOUND', 404, message);
  }
  return value;
}
