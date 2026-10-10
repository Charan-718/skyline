import { AppError } from '../../../shared/errors.js';

const transitions = {
  DRAFT: { publish: 'PUBLISHED', cancel: 'CANCELLED' },
  PUBLISHED: { cancel: 'CANCELLED', complete: 'COMPLETED' },
};

export function assertTransition(from, event) {
  const next = transitions[from]?.[event];
  if (!next) {
    throw new AppError('CONFLICT_STATE', 409, 'Invalid transition', { currentStatus: from });
  }
  return next;
}
