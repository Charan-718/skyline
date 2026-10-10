export class AppError extends Error {
  /**
   * @param {string} code
   * @param {number} httpStatus
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, httpStatus, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function assertFound(value, message = 'Resource not found') {
  if (value == null) {
    throw new AppError('NOT_FOUND', 404, message);
  }
  return value;
}
