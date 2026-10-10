import { appError } from '../../shared/errors.js';

// New expense or income links to a fundraiser (LLD §4.9, OQ-53 APPROVED):
//   fundraiser missing or in another club -> 422 FUNDRAISER_NOT_IN_CLUB
//   fundraiser COMPLETED or CANCELLED     -> 409 FUNDRAISER_CLOSED
// getFundraiserRef(id) -> { clubId, status } | null is injected from the fundraisers module.

export function createFundraiserLinkCheck(getFundraiserRef) {
  return async function assertFundraiserLinkable(clubId, fundraiserId) {
    const ref = await getFundraiserRef(fundraiserId);
    if (!ref || ref.clubId !== clubId) throw appError('FUNDRAISER_NOT_IN_CLUB');
    if (ref.status === 'COMPLETED' || ref.status === 'CANCELLED') {
      throw appError('FUNDRAISER_CLOSED', { fundraiserStatus: ref.status });
    }
  };
}
