// TODO(group1): interface stub. Group 1 (T-41) replaces this file with the events module.
// Signatures proposed by Group 2 (OQ-08, OQ-38); confirm or rename at CP-1.

/**
 * getEventClub(eventId) -> clubId | null
 * The club that owns the event, or null when the event does not exist. Used by finance/expenses
 * to enforce EVENT_NOT_IN_CLUB (Step 3 decision 4).
 */
export async function getEventClub(_eventId) {
  throw new Error('TODO(group1): events.getEventClub is not implemented yet');
}

/**
 * isClubEventOrganizer(userId, clubId) -> boolean
 * True when the user organises any event of the club (TEAM membership, LLD §4.0).
 */
export async function isClubEventOrganizer(_userId, _clubId) {
  throw new Error('TODO(group1): events.isClubEventOrganizer is not implemented yet');
}
