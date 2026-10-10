import { appError } from './errors.js';

// Club-scoped access decisions (LLD §4.0 role notation, HLD §8). Default deny.
//   allowed role in the club                    -> ok
//   other TEAM standing in the same club         -> 403 FORBIDDEN
//   no standing in the club / club does not exist -> 404 NOT_FOUND
// TEAM(club) = CLUB_HEAD ∪ TREASURER ∪ VOLUNTEER ∪ ORGANIZER of any event of the club.
// Role lookups go through Group 1 interfaces (clubs.hasClubRole, events.isClubEventOrganizer),
// which are TODO(group1) stubs until Group 1 merges. Roles are re-read on every check.

export const CLUB_ROLES = Object.freeze(['CLUB_HEAD', 'TREASURER', 'VOLUNTEER']);
export const TEAM = Object.freeze([...CLUB_ROLES, 'ORGANIZER']);

export function createAccess({ clubs, events }) {
  /** Standing of a user in a club: { roles: Set<role|'ORGANIZER'>, team: boolean }. */
  async function standing(userId, clubId) {
    const [head, treasurer, volunteer, organizer] = await Promise.all([
      clubs.hasClubRole(userId, clubId, ['CLUB_HEAD']),
      clubs.hasClubRole(userId, clubId, ['TREASURER']),
      clubs.hasClubRole(userId, clubId, ['VOLUNTEER']),
      events.isClubEventOrganizer(userId, clubId),
    ]);
    const roles = new Set();
    if (head) roles.add('CLUB_HEAD');
    if (treasurer) roles.add('TREASURER');
    if (volunteer) roles.add('VOLUNTEER');
    if (organizer) roles.add('ORGANIZER');
    return { userId, clubId, roles, team: roles.size > 0 };
  }

  /**
   * Throws unless the actor holds one of `allowed` in the club. Returns the standing.
   * `alsoAllow(standing)` can grant access on other grounds (e.g. the submitter of an expense).
   */
  async function requireRole(actor, clubId, allowed, { alsoAllow } = {}) {
    if (!actor?.userId) throw appError('UNAUTHENTICATED');
    const s = await standing(actor.userId, clubId);
    if (allowed.some((r) => s.roles.has(r))) return s;
    if (alsoAllow?.(s)) return s;
    throw appError(s.team ? 'FORBIDDEN' : 'NOT_FOUND');
  }

  return Object.freeze({ standing, requireRole });
}
